# RabbitMQ rodando como serviço Fargate dentro do próprio cluster, em vez de
# Amazon MQ gerenciado — decisão de custo (Amazon MQ cobra broker fixo mesmo
# ocioso). Persistência via EFS montado em /var/lib/rabbitmq. Só é alcançável
# de dentro da VPC (ver security group em network.tf); o App Runner chega
# nele pelo DNS privado "rabbitmq.petcard-staging.internal".

resource "aws_ecs_cluster" "this" {
  name = "${var.project}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_efs_file_system" "rabbitmq" {
  creation_token   = "${var.project}-rabbitmq"
  encrypted        = true
  throughput_mode  = "bursting"
  performance_mode = "generalPurpose"

  tags = { Name = "${var.project}-rabbitmq" }
}

resource "aws_efs_mount_target" "rabbitmq" {
  count           = length(aws_subnet.public)
  file_system_id  = aws_efs_file_system.rabbitmq.id
  subnet_id       = aws_subnet.public[count.index].id
  security_groups = [aws_security_group.efs.id]
}

resource "aws_efs_access_point" "rabbitmq" {
  file_system_id = aws_efs_file_system.rabbitmq.id

  posix_user {
    uid = 999 # usuário "rabbitmq" na imagem oficial
    gid = 999
  }

  root_directory {
    path = "/rabbitmq-data"
    creation_info {
      owner_uid   = 999
      owner_gid   = 999
      permissions = "755"
    }
  }
}

resource "aws_cloudwatch_log_group" "rabbitmq" {
  name              = "/ecs/${var.project}/rabbitmq"
  retention_in_days = 14
}

resource "aws_ecs_task_definition" "rabbitmq" {
  family                   = "${var.project}-rabbitmq"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.rabbitmq_task.arn

  volume {
    name = "rabbitmq-data"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.rabbitmq.id
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.rabbitmq.id
        iam             = "ENABLED"
      }
    }
  }

  container_definitions = jsonencode([
    {
      name      = "rabbitmq"
      image     = "rabbitmq:3.13-management-alpine"
      essential = true
      portMappings = [
        { containerPort = 5672, protocol = "tcp" },
        { containerPort = 15672, protocol = "tcp" },
      ]
      mountPoints = [
        {
          sourceVolume  = "rabbitmq-data"
          containerPath = "/var/lib/rabbitmq"
        }
      ]
      secrets = [
        { name = "RABBITMQ_DEFAULT_USER", valueFrom = aws_ssm_parameter.rabbitmq_user.arn },
        { name = "RABBITMQ_DEFAULT_PASS", valueFrom = aws_ssm_parameter.rabbitmq_password.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.rabbitmq.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "rabbitmq"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "rabbitmq" {
  name            = "${var.project}-rabbitmq"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.rabbitmq.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.rabbitmq.id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.rabbitmq.arn
  }

  # Fila não é stateless: trocar de instância descartando a fila em uso
  # silenciosamente é pior do que só falhar rápido — não força novo
  # deployment fora de uma troca de imagem/task-def explícita.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100
}

resource "aws_service_discovery_service" "rabbitmq" {
  name = "rabbitmq"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.internal.id
    dns_records {
      ttl  = 10
      type = "A"
    }
    routing_policy = "MULTIVALUE"
  }
}

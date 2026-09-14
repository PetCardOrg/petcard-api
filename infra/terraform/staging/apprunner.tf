resource "aws_apprunner_vpc_connector" "this" {
  vpc_connector_name = "${var.project}-connector"
  subnets            = aws_subnet.public[*].id
  security_groups    = [aws_security_group.apprunner_connector.id]
}

resource "aws_apprunner_service" "api" {
  service_name = "${var.project}-api"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access.arn
    }

    # Nova imagem publicada na tag "staging" dispara deploy sozinho — é
    # esse mecanismo, junto do push feito pelo workflow de CD, que cumpre o
    # critério "deploy automático após merge na develop".
    auto_deployments_enabled = true

    image_repository {
      image_identifier      = "${aws_ecr_repository.api.repository_url}:${var.container_image_tag}"
      image_repository_type = "ECR"

      image_configuration {
        port = "3000"

        runtime_environment_variables = {
          NODE_ENV = "production"
          PORT     = "3000"
          # O App Runner só sabe a própria URL depois do primeiro apply
          # (não dá pra referenciar aws_apprunner_service.api.service_url
          # dentro do próprio recurso). var.api_base_url fica vazio no
          # primeiro apply e é preenchido num segundo apply com a URL real
          # — ver infra/terraform/staging/README.md.
          API_BASE_URL                     = var.api_base_url != "" ? var.api_base_url : "https://placeholder.awsapprunner.com"
          CORS_ORIGINS                     = var.cors_origins
          AWS_REGION                       = var.aws_region
          AWS_S3_BUCKET                    = aws_s3_bucket.uploads.bucket
          RABBITMQ_QR_CODE_QUEUE           = "qr-code.generate"
          RABBITMQ_QR_CODE_DLQ             = "qr-code.generate.dlq"
          RABBITMQ_NOTIFICATION_PUSH_QUEUE = "notification.push"
          RABBITMQ_NOTIFICATION_PUSH_DLQ   = "notification.push.dlq"
          RABBITMQ_CALENDAR_SYNC_QUEUE     = "calendar.sync"
          RABBITMQ_CALENDAR_SYNC_DLQ       = "calendar.sync.dlq"
          FCM_ENABLED                      = "false"
          CRMV_PROVIDER                    = "stub"
          APP_DEEP_LINK_BASE               = var.api_base_url != "" ? "${var.api_base_url}/auth" : "https://placeholder.awsapprunner.com/auth"
        }

        runtime_environment_secrets = {
          DATABASE_URL          = aws_ssm_parameter.db_url.arn
          RABBITMQ_URL          = aws_ssm_parameter.rabbitmq_url.arn
          JWT_SECRET            = aws_ssm_parameter.jwt_secret.arn
          AWS_ACCESS_KEY_ID     = aws_ssm_parameter.s3_access_key_id.arn
          AWS_SECRET_ACCESS_KEY = aws_ssm_parameter.s3_secret_access_key.arn
          SMTP_HOST             = aws_ssm_parameter.smtp_host.arn
          SMTP_PORT             = aws_ssm_parameter.smtp_port.arn
          SMTP_SECURE           = aws_ssm_parameter.smtp_secure.arn
          SMTP_USER             = aws_ssm_parameter.smtp_user.arn
          SMTP_PASS             = aws_ssm_parameter.smtp_pass.arn
          MAIL_FROM             = aws_ssm_parameter.mail_from.arn
        }
      }
    }
  }

  instance_configuration {
    cpu               = "256"
    memory            = "512"
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.this.arn
    }
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  tags = { Name = "${var.project}-api" }
}

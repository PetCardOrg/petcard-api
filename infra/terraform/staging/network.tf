# Rede mínima: sem NAT Gateway (custo fixo alto, ~US$32/mês, sem uso real
# num staging de baixo tráfego). RDS e RabbitMQ ficam em subnets "públicas"
# (roteadas pra internet), mas sem IP público (RDS) ou com IP público só
# porque o Fargate exige (RabbitMQ) — o isolamento real vem do security
# group, não da topologia de subnet. Ver ADR sobre a troca pra App Runner
# em petcard-docs/architecture/adr/.

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.project}-vpc" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.project}-igw" }
}

resource "aws_subnet" "public" {
  count                   = length(var.public_subnet_cidrs)
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${var.project}-public-${count.index}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = { Name = "${var.project}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Namespace de DNS privado pra descoberta de serviço dentro da VPC — o
# App Runner resolve isto através do VPC Connector, sem precisar de
# load balancer interno.
resource "aws_service_discovery_private_dns_namespace" "internal" {
  name = "${var.project}.internal"
  vpc  = aws_vpc.this.id
}

# Security group das ENIs do VPC Connector do App Runner.
resource "aws_security_group" "apprunner_connector" {
  name_prefix = "${var.project}-apprunner-"
  description = "ENIs do VPC Connector do App Runner"
  vpc_id      = aws_vpc.this.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-apprunner-connector" }
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.project}-rds-"
  description = "Postgres do staging — só o App Runner acessa"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.apprunner_connector.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-rds" }
}

resource "aws_security_group" "rabbitmq" {
  name_prefix = "${var.project}-rabbitmq-"
  description = "RabbitMQ do staging — só o App Runner acessa"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port       = 5672
    to_port         = 5672
    protocol        = "tcp"
    security_groups = [aws_security_group.apprunner_connector.id]
  }

  # Management UI (15672) só de dentro da VPC, pra debug pontual via
  # bastion/SSM — não precisa estar aberta pro App Runner.
  ingress {
    from_port   = 15672
    to_port     = 15672
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-rabbitmq" }
}

resource "aws_security_group" "efs" {
  name_prefix = "${var.project}-efs-"
  description = "EFS usado pra persistir dados do RabbitMQ"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [aws_security_group.rabbitmq.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-efs" }
}

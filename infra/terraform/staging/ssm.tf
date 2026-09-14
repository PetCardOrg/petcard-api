# SecureString no SSM Parameter Store em vez de Secrets Manager — mesma
# proteção (KMS), sem custo por segredo (Secrets Manager cobra ~US$0.40/mês
# por segredo; parâmetros SSM "standard" são gratuitos).

resource "aws_ssm_parameter" "db_url" {
  name  = "/${var.project}/database-url"
  type  = "SecureString"
  value = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.this.address}:5432/${var.db_name}?schema=public"
}

resource "aws_ssm_parameter" "rabbitmq_user" {
  name  = "/${var.project}/rabbitmq-user"
  type  = "SecureString"
  value = var.rabbitmq_user
}

resource "aws_ssm_parameter" "rabbitmq_password" {
  name  = "/${var.project}/rabbitmq-password"
  type  = "SecureString"
  value = var.rabbitmq_password
}

resource "aws_ssm_parameter" "rabbitmq_url" {
  name  = "/${var.project}/rabbitmq-url"
  type  = "SecureString"
  value = "amqp://${var.rabbitmq_user}:${var.rabbitmq_password}@rabbitmq.${aws_service_discovery_private_dns_namespace.internal.name}:5672"
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/${var.project}/jwt-secret"
  type  = "SecureString"
  value = var.jwt_secret
}

resource "aws_ssm_parameter" "smtp_host" {
  name  = "/${var.project}/smtp-host"
  type  = "SecureString"
  value = var.smtp_host
}

resource "aws_ssm_parameter" "smtp_port" {
  name  = "/${var.project}/smtp-port"
  type  = "String"
  value = var.smtp_port
}

resource "aws_ssm_parameter" "smtp_secure" {
  name  = "/${var.project}/smtp-secure"
  type  = "String"
  value = var.smtp_secure
}

resource "aws_ssm_parameter" "smtp_user" {
  name  = "/${var.project}/smtp-user"
  type  = "SecureString"
  value = var.smtp_user
}

resource "aws_ssm_parameter" "smtp_pass" {
  name  = "/${var.project}/smtp-pass"
  type  = "SecureString"
  value = var.smtp_pass
}

resource "aws_ssm_parameter" "mail_from" {
  name  = "/${var.project}/mail-from"
  type  = "String"
  value = var.mail_from
}

variable "aws_region" {
  description = "Região AWS do ambiente de staging."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Prefixo usado no nome dos recursos."
  type        = string
  default     = "petcard-staging"
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "2 subnets públicas em AZs diferentes (exigido pelo subnet group do RDS)."
  type        = list(string)
  default     = ["10.20.1.0/24", "10.20.2.0/24"]
}

variable "db_name" {
  type    = string
  default = "petcard_staging"
}

variable "db_username" {
  type    = string
  default = "petcard"
}

variable "db_password" {
  description = "Senha do RDS. Não tem default de propósito — passar via TF_VAR_db_password ou terraform.tfvars fora do git."
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "rabbitmq_user" {
  type    = string
  default = "petcard"
}

variable "rabbitmq_password" {
  description = "Senha do RabbitMQ. Sem default — mesma lógica de db_password."
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "Segredo usado para assinar os JWTs da API em staging. Sem default."
  type        = string
  sensitive   = true
}

variable "cors_origins" {
  description = "Origens autorizadas por CORS em staging (lista separada por vírgula, formato usado pelo app.config)."
  type        = string
  default     = ""
}

variable "api_base_url" {
  description = "Origem pública da API em staging (https://<id>.us-east-1.awsapprunner.com). Vazio no primeiro apply — o App Runner só existe depois dele. Preencher e reaplicar com o valor de `terraform output apprunner_service_url`."
  type        = string
  default     = ""
}

variable "smtp_host" {
  description = "Host SMTP (ADR-008 — nodemailer, sem serviço pago). Sem default: sem ele a API nem sobe em produção."
  type        = string
  sensitive   = true
}

variable "smtp_port" {
  type    = string
  default = "587"
}

variable "smtp_secure" {
  type    = string
  default = "false"
}

variable "smtp_user" {
  type      = string
  sensitive = true
}

variable "smtp_pass" {
  type      = string
  sensitive = true
}

variable "mail_from" {
  type    = string
  default = "PetCard Staging <no-reply@petcard.app>"
}

variable "container_image_tag" {
  description = "Tag da imagem publicada pelo workflow de CD. 'staging' aponta sempre para o último build da develop."
  type        = string
  default     = "staging"
}

variable "github_oidc_provider_arn" {
  description = "ARN do provedor OIDC do GitHub Actions, criado no bootstrap (terraform output github_oidc_provider_arn)."
  type        = string
}

variable "github_repository" {
  description = "owner/repo autorizado a assumir a role de deploy via OIDC."
  type        = string
  default     = "PetCardOrg/petcard-api"
}

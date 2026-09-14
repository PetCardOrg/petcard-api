variable "aws_region" {
  description = "Região AWS onde o bucket de state e o provedor OIDC são criados."
  type        = string
  default     = "us-east-1"
}

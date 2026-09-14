output "apprunner_service_url" {
  description = "URL pública de staging. Usar em API_BASE_URL/APP_DEEP_LINK_BASE no segundo apply."
  value       = "https://${aws_apprunner_service.api.service_url}"
}

output "apprunner_service_arn" {
  value = aws_apprunner_service.api.arn
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "github_actions_deploy_role_arn" {
  description = "Colar em AWS_ROLE_ARN no ambiente 'staging' do GitHub."
  value       = aws_iam_role.github_actions_deploy.arn
}

output "db_endpoint" {
  value = aws_db_instance.this.address
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.bucket
}

# Bootstrap: recursos que existem uma única vez por conta AWS, antes de
# qualquer stack usar backend remoto. Roda com state local (não tem uma
# "galinha e o ovo" pra resolver aqui) e só precisa ser aplicado de novo se
# algo aqui for destruído por engano.
#
# Cria:
# - bucket S3 + tabela DynamoDB pro backend remoto da stack "staging"
# - o provedor OIDC do GitHub Actions na conta (só pode existir 1 por conta)
#
# Uso:
#   cd infra/terraform/bootstrap
#   terraform init
#   terraform apply

terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_s3_bucket" "terraform_state" {
  bucket = "petcard-terraform-state-${data.aws_caller_identity.current.account_id}"

  # Backend de infra: apagar por engano custaria caro (perde todo o
  # histórico de state). Só remover manualmente, de propósito.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket                  = aws_s3_bucket.terraform_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "terraform_locks" {
  name         = "petcard-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

data "aws_caller_identity" "current" {}

# Provedor OIDC do GitHub Actions — permite que workflows do GitHub assumam
# roles IAM sem chave de acesso de longa duração armazenada em secret.
# Um provedor cobre todos os repositórios da conta; a stack "staging" cria a
# role específica do deploy referenciando este ARN.
resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# Postgres + PostGIS. RDS Postgres já vem com a extensão PostGIS disponível
# (só falta `CREATE EXTENSION postgis;`, que não é gerenciável pelo
# terraform — rodar uma vez via psql/migration depois do apply).
# PostGIS hoje não é consumido em código (pivô pro Google Places, ver
# ../../CLAUDE.md da api) — mesmo assim mantemos aqui pra bater com a
# decisão de "capacidade reservada" já registrada.

resource "aws_db_subnet_group" "this" {
  name       = "${var.project}-db"
  subnet_ids = aws_subnet.public[*].id

  tags = { Name = "${var.project}-db" }
}

resource "aws_db_instance" "this" {
  identifier     = "${var.project}-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage     = 20
  max_allocated_storage = 50
  storage_type          = "gp3"

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = 3
  skip_final_snapshot     = true
  deletion_protection     = false
  apply_immediately       = true

  tags = { Name = "${var.project}-db" }
}

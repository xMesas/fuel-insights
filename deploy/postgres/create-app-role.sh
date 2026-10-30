#!/bin/sh
# Runs once, when the data volume is still empty. The application gets its own role: it owns its database (so
# Flyway can create tables) but it is not a superuser. The superuser "postgres" is only for administration.
set -eu

# psql reads the password with a backtick command, so it never appears on a command line. Line endings are
# removed the way Spring reads the same file (a file written on Windows may end in \r\n).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
	-v app_user="$APP_DB_USER" -v db="$POSTGRES_DB" <<'SQL'
\set app_password `tr -d '\r\n' < "$APP_DB_PASSWORD_FILE"`
create role :"app_user" login password :'app_password';
alter database :"db" owner to :"app_user";
SQL

-- Spring Batch 6 metadata tables, copied from spring-batch-core 6.0.6 (schema-postgresql.sql).

CREATE TABLE BATCH_JOB_INSTANCE (
	JOB_INSTANCE_ID BIGINT  NOT NULL PRIMARY KEY,
	VERSION BIGINT,
	JOB_NAME VARCHAR(100) NOT NULL,
	JOB_KEY VARCHAR(32) NOT NULL,
	constraint JOB_INST_UN unique (JOB_NAME, JOB_KEY)
) ;

CREATE TABLE BATCH_JOB_EXECUTION (
	JOB_EXECUTION_ID BIGINT  NOT NULL PRIMARY KEY,
	VERSION BIGINT,
	JOB_INSTANCE_ID BIGINT NOT NULL,
	CREATE_TIME TIMESTAMP NOT NULL,
	START_TIME TIMESTAMP DEFAULT NULL,
	END_TIME TIMESTAMP DEFAULT NULL,
	STATUS VARCHAR(10),
	EXIT_CODE VARCHAR(2500),
	EXIT_MESSAGE VARCHAR(2500),
	LAST_UPDATED TIMESTAMP,
	constraint JOB_INST_EXEC_FK foreign key (JOB_INSTANCE_ID)
	references BATCH_JOB_INSTANCE(JOB_INSTANCE_ID)
) ;

CREATE TABLE BATCH_JOB_EXECUTION_PARAMS (
	JOB_EXECUTION_ID BIGINT NOT NULL,
	PARAMETER_NAME VARCHAR(100) NOT NULL,
	PARAMETER_TYPE VARCHAR(100) NOT NULL,
	PARAMETER_VALUE VARCHAR(2500),
	IDENTIFYING CHAR(1) NOT NULL,
	constraint JOB_EXEC_PARAMS_FK foreign key (JOB_EXECUTION_ID)
	references BATCH_JOB_EXECUTION(JOB_EXECUTION_ID)
) ;

CREATE TABLE BATCH_STEP_EXECUTION (
	STEP_EXECUTION_ID BIGINT  NOT NULL PRIMARY KEY,
	VERSION BIGINT NOT NULL,
	STEP_NAME VARCHAR(100) NOT NULL,
	JOB_EXECUTION_ID BIGINT NOT NULL,
	CREATE_TIME TIMESTAMP NOT NULL,
	START_TIME TIMESTAMP DEFAULT NULL,
	END_TIME TIMESTAMP DEFAULT NULL,
	STATUS VARCHAR(10),
	COMMIT_COUNT BIGINT,
	READ_COUNT BIGINT,
	FILTER_COUNT BIGINT,
	WRITE_COUNT BIGINT,
	READ_SKIP_COUNT BIGINT,
	WRITE_SKIP_COUNT BIGINT,
	PROCESS_SKIP_COUNT BIGINT,
	ROLLBACK_COUNT BIGINT,
	EXIT_CODE VARCHAR(2500),
	EXIT_MESSAGE VARCHAR(2500),
	LAST_UPDATED TIMESTAMP,
	constraint JOB_EXEC_STEP_FK foreign key (JOB_EXECUTION_ID)
	references BATCH_JOB_EXECUTION(JOB_EXECUTION_ID)
) ;

CREATE TABLE BATCH_STEP_EXECUTION_CONTEXT (
	STEP_EXECUTION_ID BIGINT NOT NULL PRIMARY KEY,
	SHORT_CONTEXT VARCHAR(2500) NOT NULL,
	SERIALIZED_CONTEXT TEXT,
	constraint STEP_EXEC_CTX_FK foreign key (STEP_EXECUTION_ID)
	references BATCH_STEP_EXECUTION(STEP_EXECUTION_ID)
) ;

CREATE TABLE BATCH_JOB_EXECUTION_CONTEXT (
	JOB_EXECUTION_ID BIGINT NOT NULL PRIMARY KEY,
	SHORT_CONTEXT VARCHAR(2500) NOT NULL,
	SERIALIZED_CONTEXT TEXT,
	constraint JOB_EXEC_CTX_FK foreign key (JOB_EXECUTION_ID)
	references BATCH_JOB_EXECUTION(JOB_EXECUTION_ID)
) ;

CREATE SEQUENCE BATCH_STEP_EXECUTION_SEQ MAXVALUE 9223372036854775807 NO CYCLE;
CREATE SEQUENCE BATCH_JOB_EXECUTION_SEQ MAXVALUE 9223372036854775807 NO CYCLE;
CREATE SEQUENCE BATCH_JOB_INSTANCE_SEQ MAXVALUE 9223372036854775807 NO CYCLE;

-- Normalised brand next to the raw sign text.
alter table station add column brand text;

-- Each price keeps the province of its station on that day, so old days do not move
-- if a station later changes province in the catalog.
alter table price_daily add column province_id char(2) references province (id);
update price_daily d set province_id = s.province_id from station s where s.id = d.station_id;
alter table price_daily alter column province_id set not null;

-- The import of a day now has a lifecycle. published_at says when the web last got its numbers.
alter table import_day add column status text not null default 'COMPLETED'
	check (status in ('RUNNING', 'COMPLETED', 'FAILED'));
alter table import_day alter column status drop default;
alter table import_day add column error text;
alter table import_day add column started_at timestamptz;
alter table import_day add column published_at timestamptz;
alter table import_day alter column finished_at drop not null;
alter table import_day alter column stations drop not null;
alter table import_day alter column prices drop not null;
update import_day set started_at = finished_at, published_at = finished_at;

-- What the web reads: one row per day, fuel and area (a province id, or ES for Spain).
create table price_stats_daily (
	day           date          not null,
	fuel          text          not null,
	area          char(2)       not null,
	average_price numeric(5, 3) not null,
	min_price     numeric(5, 3) not null,
	max_price     numeric(5, 3) not null,
	median_price  numeric(5, 3) not null,
	stations      integer       not null,
	primary key (day, fuel, area)
);

-- Publish the days imported in phase 1 with the same rules the job uses.
insert into price_stats_daily (day, fuel, area, average_price, min_price, max_price, median_price, stations)
select day, fuel, province_id, round(avg(price), 3), min(price), max(price),
	round(cast(percentile_cont(0.5) within group (order by price) as numeric), 3), count(*)
from price_daily
group by day, fuel, province_id
union all
select day, fuel, 'ES', round(avg(price), 3), min(price), max(price),
	round(cast(percentile_cont(0.5) within group (order by price) as numeric), 3), count(*)
from price_daily
group by day, fuel;

package com.fuelinsights.ingestion;

import java.time.LocalDate;

import org.springframework.batch.core.configuration.annotation.StepScope;
import org.springframework.batch.core.job.Job;
import org.springframework.batch.core.job.builder.JobBuilder;
import org.springframework.batch.core.repository.JobRepository;
import org.springframework.batch.core.scope.context.ChunkContext;
import org.springframework.batch.core.step.Step;
import org.springframework.batch.core.step.builder.StepBuilder;
import org.springframework.batch.infrastructure.repeat.RepeatStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;

import com.fuelinsights.prices.DailyStatsRepository;
import com.fuelinsights.prices.PriceRepository;
import com.fuelinsights.stations.StationRepository;

/**
 * The import of one day as a Spring Batch job: prepare, load in chunks, publish. The first two steps run again on a
 * restart even if they finished before, so a retry always rebuilds the whole day.
 */
@Configuration(proxyBeanMethods = false)
class ImportJobConfig {

	static final String JOB_NAME = "importDayJob";

	private static final int CHUNK_SIZE = 1000;

	@Bean
	Job importDayJob(JobRepository jobRepository, Step prepareDay, Step loadPrices, Step publishDay) {
		return new JobBuilder(JOB_NAME, jobRepository).start(prepareDay).next(loadPrices).next(publishDay).build();
	}

	@Bean
	Step prepareDay(JobRepository jobRepository, PlatformTransactionManager transactionManager,
			ImportDayRepository importDays, PriceRepository prices) {
		return new StepBuilder("prepareDay", jobRepository).tasklet((contribution, chunkContext) -> {
			LocalDate day = dayOf(chunkContext);
			importDays.markRunning(day, executionOf(chunkContext));
			prices.deleteDay(day);
			return RepeatStatus.FINISHED;
		}, transactionManager).allowStartIfComplete(true).build();
	}

	@Bean
	Step loadPrices(JobRepository jobRepository, PlatformTransactionManager transactionManager,
			MinistryDayReader ministryDayReader, StationProcessor stationProcessor, StationDayWriter stationDayWriter) {
		return new StepBuilder("loadPrices", jobRepository).<MinistryStation, StationDay>chunk(CHUNK_SIZE)
			.transactionManager(transactionManager)
			.reader(ministryDayReader)
			.processor(stationProcessor)
			.writer(stationDayWriter)
			.allowStartIfComplete(true)
			.build();
	}

	// One transaction: the new aggregates and the "published" mark appear together, or not at all.
	@Bean
	Step publishDay(JobRepository jobRepository, PlatformTransactionManager transactionManager,
			DailyStatsRepository dailyStats, ImportDayRepository importDays) {
		return new StepBuilder("publishDay", jobRepository).tasklet((contribution, chunkContext) -> {
			LocalDate day = dayOf(chunkContext);
			importDays.checkOwner(day, executionOf(chunkContext));
			dailyStats.rebuildDay(day);
			importDays.markPublished(day);
			return RepeatStatus.FINISHED;
		}, transactionManager).build();
	}

	@Bean
	@StepScope
	MinistryDayReader ministryDayReader(MinistryClient client, @Value("#{jobParameters['date']}") LocalDate date) {
		return new MinistryDayReader(client, date);
	}

	@Bean
	@StepScope
	StationDayWriter stationDayWriter(StationRepository stations, PriceRepository prices,
			ImportDayRepository importDays, @Value("#{jobParameters['date']}") LocalDate date,
			@Value("#{stepExecution.jobExecutionId}") long execution) {
		return new StationDayWriter(stations, prices, importDays, date, execution);
	}

	private static LocalDate dayOf(ChunkContext chunkContext) {
		return chunkContext.getStepContext().getStepExecution().getJobParameters().getLocalDate("date");
	}

	private static long executionOf(ChunkContext chunkContext) {
		return chunkContext.getStepContext().getStepExecution().getJobExecutionId();
	}

}

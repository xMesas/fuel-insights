package com.fuelinsights.ingestion;

import java.time.LocalDate;

import org.springframework.batch.core.BatchStatus;
import org.springframework.batch.core.job.Job;
import org.springframework.batch.core.job.JobExecution;
import org.springframework.batch.core.job.parameters.InvalidJobParametersException;
import org.springframework.batch.core.job.parameters.JobParameters;
import org.springframework.batch.core.job.parameters.JobParametersBuilder;
import org.springframework.batch.core.launch.JobExecutionAlreadyRunningException;
import org.springframework.batch.core.launch.JobInstanceAlreadyCompleteException;
import org.springframework.batch.core.launch.JobOperator;
import org.springframework.batch.core.launch.JobRestartException;
import org.springframework.batch.core.repository.JobRepository;
import org.springframework.stereotype.Service;

/** Imports one day by running the batch job under the import lock, and turns its outcome into an answer. */
@Service
public class DayImporter {

	private final ImportLock lock;

	private final JobOperator jobOperator;

	private final JobRepository jobRepository;

	private final Job importDayJob;

	private final ImportDayRepository importDays;

	DayImporter(ImportLock lock, JobOperator jobOperator, JobRepository jobRepository, Job importDayJob,
			ImportDayRepository importDays) {
		this.lock = lock;
		this.jobOperator = jobOperator;
		this.jobRepository = jobRepository;
		this.importDayJob = importDayJob;
		this.importDays = importDays;
	}

	/** Without {@code force}, a day that is already COMPLETED is left as it is. */
	public ImportDayView importDay(LocalDate date, boolean force) {
		return this.lock.runExclusively(() -> run(date, force));
	}

	private ImportDayView run(LocalDate date, boolean force) {
		recoverAbandonedExecutions();
		if (!force && this.importDays.isCompleted(date)) {
			return this.importDays.find(date).orElseThrow();
		}
		JobParametersBuilder parameters = new JobParametersBuilder().addLocalDate("date", date);
		if (force) {
			// A new identifying parameter makes a new job instance, so a finished day can run again.
			parameters.addLong("run", System.currentTimeMillis());
		}
		JobExecution execution = start(parameters.toJobParameters(), date);
		// The job does not throw: a failure is recorded in the execution, so it has to be read from there.
		if (execution.getStatus() != BatchStatus.COMPLETED) {
			Throwable failure = execution.getAllFailureExceptions().stream().findFirst().orElse(null);
			this.importDays.markFailed(date, execution.getId(), describe(execution, failure));
			MinistryException ministryFailure = findMinistryException(failure);
			if (ministryFailure != null) {
				throw ministryFailure;
			}
			throw new ImportFailedException(date, failure);
		}
		return this.importDays.find(date).orElseThrow();
	}

	private JobExecution start(JobParameters parameters, LocalDate date) {
		try {
			return this.jobOperator.start(this.importDayJob, parameters);
		}
		catch (JobInstanceAlreadyCompleteException ex) {
			// Batch says the day finished but import_day disagrees (for example the row was removed): run it again.
			return start(new JobParametersBuilder(parameters).addLong("run", System.currentTimeMillis())
				.toJobParameters(), date);
		}
		catch (JobExecutionAlreadyRunningException ex) {
			throw new ImportBusyException();
		}
		catch (JobRestartException | InvalidJobParametersException ex) {
			throw new ImportFailedException(date, ex);
		}
	}

	// We hold the lock, so nothing else is importing: an execution still marked as running was left behind by a
	// process that died. Recovering it marks it FAILED, so the next start can restart that day.
	private void recoverAbandonedExecutions() {
		this.jobRepository.findRunningJobExecutions(ImportJobConfig.JOB_NAME).forEach(this.jobOperator::recover);
	}

	private static MinistryException findMinistryException(Throwable failure) {
		for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
			if (cause instanceof MinistryException ministryException) {
				return ministryException;
			}
		}
		return null;
	}

	private static String describe(JobExecution execution, Throwable failure) {
		return (failure != null) ? failure.getClass().getSimpleName() + ": " + failure.getMessage()
				: "Job ended as " + execution.getStatus();
	}

}

package com.mavis.analyzer.orchestrator.service.impl;

import org.springframework.context.annotation.*;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
@Configuration @EnableScheduling
public class AnalysisLifecycleConfiguration {
    @Bean public AnalysisExecutionRegistry analysisExecutions(){return new AnalysisExecutionRegistry();}
    @Bean(name="mavisAnalysisExecutor") public ThreadPoolTaskExecutor analysisExecutor(){var executor=new ThreadPoolTaskExecutor();executor.setCorePoolSize(1);executor.setMaxPoolSize(2);executor.setQueueCapacity(64);executor.setThreadNamePrefix("mavis-analysis-");executor.setWaitForTasksToCompleteOnShutdown(false);return executor;}
}

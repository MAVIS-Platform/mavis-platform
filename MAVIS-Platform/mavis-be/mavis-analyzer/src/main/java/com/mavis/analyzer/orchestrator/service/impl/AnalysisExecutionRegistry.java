package com.mavis.analyzer.orchestrator.service.impl;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
public final class AnalysisExecutionRegistry {
    private final UUID instanceId=UUID.randomUUID();
    private final ConcurrentHashMap<UUID,Thread> threads=new ConcurrentHashMap<>();
    public UUID instanceId(){return instanceId;}
    public void register(UUID job){if(threads.putIfAbsent(job,Thread.currentThread())!=null)throw new IllegalStateException("Duplicate local execution");}
    public void unregister(UUID job){threads.remove(job,Thread.currentThread());}
    public boolean interrupt(UUID job){Thread thread=threads.get(job);if(thread==null)return false;thread.interrupt();return true;}
}

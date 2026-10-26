package com.mavis.analyzer.detector.docker.dto;

/** A sanitized endpoint reference; never retains the environment value or credentials. */
public record DetectedConnectionDTO(String targetService, String protocol, Integer port,
                                    String declaration, int lineNumber) { }

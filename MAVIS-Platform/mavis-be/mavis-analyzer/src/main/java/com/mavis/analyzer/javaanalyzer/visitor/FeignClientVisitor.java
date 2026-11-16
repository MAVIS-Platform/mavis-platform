package com.mavis.analyzer.javaanalyzer.visitor;

/**
 * Backward-compatible FeignClientVisitor subclass of HttpClientVisitor.
 */
public class FeignClientVisitor extends HttpClientVisitor {

    public FeignClientVisitor() {
        super(null);
    }

    public FeignClientVisitor(String currentFilePath) {
        super(currentFilePath);
    }
}

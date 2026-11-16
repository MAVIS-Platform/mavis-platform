-- Configuration declares dependencies; it does not establish business HTTP calls.
ALTER TABLE model_relationships DROP CONSTRAINT model_relationships_relation_type_check;
ALTER TABLE model_relationships ADD CONSTRAINT model_relationships_relation_type_check
    CHECK (relation_type IN ('SERVICE_HTTP_CALL','CODE_DEPENDENCY','DATABASE_ACCESS','RUNTIME_OBSERVED','DECLARED_COMPOSE','MESSAGE_PUBLISH','MESSAGE_SUBSCRIBE',
        'DECLARED_LINK','CONFIGURATION_DEPENDENCY','SERVICE_DISCOVERY','TRACING_EXPORT','GATEWAY_ROUTE','CONFIGURED_ENDPOINT'));

-- Additive enum extensions for source-backed messaging and configured endpoints.
ALTER TABLE model_elements DROP CONSTRAINT model_elements_element_type_check;
ALTER TABLE model_elements ADD CONSTRAINT model_elements_element_type_check
    CHECK (element_type IN ('SYSTEM','SERVICE_CONTAINER','COMPONENT','CLASS_INTERFACE','DATABASE','EXTERNAL_SYSTEM','QUEUE_BROKER','MESSAGE_CHANNEL'));
ALTER TABLE model_relationships DROP CONSTRAINT model_relationships_relation_type_check;
ALTER TABLE model_relationships ADD CONSTRAINT model_relationships_relation_type_check
    CHECK (relation_type IN ('SERVICE_HTTP_CALL','CODE_DEPENDENCY','DATABASE_ACCESS','RUNTIME_OBSERVED','DECLARED_COMPOSE','MESSAGE_PUBLISH','MESSAGE_SUBSCRIBE'));
ALTER TABLE model_relationships DROP CONSTRAINT model_relationships_origin_layer_check;
ALTER TABLE model_relationships ADD CONSTRAINT model_relationships_origin_layer_check
    CHECK (origin_layer IN ('STATIC','CONFIG','DEPLOYMENT','RUNTIME','STATIC_AND_RUNTIME'));
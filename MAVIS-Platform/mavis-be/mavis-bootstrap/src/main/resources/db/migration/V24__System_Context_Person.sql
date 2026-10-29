-- Human actors are stored only through explicit controlled context confirmation.
ALTER TABLE model_elements DROP CONSTRAINT model_elements_element_type_check;
ALTER TABLE model_elements ADD CONSTRAINT model_elements_element_type_check
    CHECK (element_type IN ('SYSTEM','SERVICE_CONTAINER','COMPONENT','CLASS_INTERFACE','DATABASE','EXTERNAL_SYSTEM','QUEUE_BROKER','MESSAGE_CHANNEL','PERSON'));

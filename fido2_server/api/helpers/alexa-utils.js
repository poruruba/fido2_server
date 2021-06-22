'use strict';

var AWS = require('aws-sdk');
AWS.config.update({region: 'ap-northeast-1'});

//const Adapter = require('ask-sdk-dynamodb-persistence-adapter');
//const config = {tableName: 'AskPersistentAttributes', createTable: true};
//var adapter = new Adapter.DynamoDbPersistenceAdapter(config);   

class AlexaUtils{
    constructor(alexa, adapter){
        this.alexa = alexa;
        this.skillBuilder = alexa.SkillBuilders.custom();
        this.DynamoDBAdapter = adapter;        
    }

    intent( matcher, handle ){
        this.skillBuilder.addRequestHandlers(new BaseIntentHandler(matcher, null, handle));
    }

    userEvent(matcher, handle) {
        this.skillBuilder.addRequestHandlers(new BaseIntentHandler("UserEvent", matcher, handle));
    }

    customReceived( handle ){
        this.skillBuilder.addRequestHandlers(new BaseIntentHandler("CustomInterfaceController.EventsReceived", null, handle));
    }
    customExpired( handle ){
        this.skillBuilder.addRequestHandlers(new BaseIntentHandler("CustomInterfaceController.Expired", null, handle));
    }

    errorIntent( handle ){
        ErrorHandler.handle = handle;
    }

    getAttributes( handlerInput ){
        return handlerInput.attributesManager.getSessionAttributes();
    }

    setAttributes( handlerInput, attributes){
        handlerInput.attributesManager.setSessionAttributes(attributes);
    }

    async getPersistentAttributes( handlerInput ){
        return handlerInput.attributesManager.getPersistentAttributes();
    }

    setPersistentAttributes( handlerInput, attributes){
        handlerInput.attributesManager.setPersistentAttributes(attributes);
    }

    async savePersistentAttributes( handlerInput ){
        handlerInput.attributesManager.savePersistentAttributes();
    }

    getSlotId(slot){
        if( slot.resolutions.resolutionsPerAuthority[0].status.code != "ER_SUCCESS_MATCH" )
            return null;
        return slot.resolutions.resolutionsPerAuthority[0].values[0].value.id;
    }

    getSlots( handlerInput ){
        return handlerInput.requestEnvelope.request.intent.slots;
    }

    getAccessToken(handlerInput){
        return handlerInput.requestEnvelope.context.System.user.accessToken;
    }

    getConnectedEndpoints(handlerInput){
        return handlerInput.serviceClientFactory.getEndpointEnumerationServiceClient().getEndpoints()
        .then(response =>{
            return response.endpoints;
        });
    }

    getUserEventRequest(handlerInput){
        return handlerInput.requestEnvelope.request;
    }
    
    buildCustomDirective(endpointId, namespace, name, payload) {
        return {
            type: 'CustomInterfaceController.SendDirective',
            header: {
                name: name,
                namespace: namespace
            },
            endpoint: {
                endpointId: endpointId
            },
            payload: payload
        };
    }
    
    buildStartEventHandlerDirective(token, namespace, name, expirationPayload, durationMs) {
        return {
            type: "CustomInterfaceController.StartEventHandler",
            token: token,
            eventFilter: {
                filterExpression: {
                    'and': [
                        { '==': [{ 'var': 'header.namespace' }, namespace] },
                        { '==': [{ 'var': 'header.name' }, name] }
                    ]
                },
                filterMatchAction: 'SEND_AND_TERMINATE'
            },
            expiration: {
                durationInMilliseconds: durationMs,
                expirationPayload: expirationPayload
            }
        };
    }
    
    buildStopEventHandlerDirective(token) {
        return {
            type: "CustomInterfaceController.StopEventHandler",
            token: token
        };
    }

    buildRenderDocumentDirective(token, document, datasources){
        return {
            type: 'Alexa.Presentation.APL.RenderDocument',
            token: token,
            document: document,
            datasources: datasources
        };
    }

    buildExecuteCommandsDirective(token, commands){
        return {
            type: 'Alexa.Presentation.APL.ExecuteCommands',
            token: token,
            commands: commands
        };
    }

    lambda(){
        if( this.DynamoDBAdapter ){
            return this.skillBuilder
            .addErrorHandlers(ErrorHandler)
            .withPersistenceAdapter(this.DynamoDBAdapter)
            .withApiClient(new this.alexa.DefaultApiClient())
            .lambda();
        }else{
            return this.skillBuilder
            .addErrorHandlers(ErrorHandler)
            .withApiClient(new this.alexa.DefaultApiClient())
            .lambda();
        }
    }
};

class BaseIntentHandler{
    constructor(type, matcher, handle){
        this.type = type;
        this.matcher = matcher;
        this.myhandle = handle;
    }

    canHandle(handlerInput) {
        if (this.type == 'LaunchRequest'){
            return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
        } else if (this.type == 'HelpIntent' ){
            return handlerInput.requestEnvelope.request.type === 'IntentRequest'
                && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent';
        } else if (this.type == 'CancelIntent' ){
            return handlerInput.requestEnvelope.request.type === 'IntentRequest'
                && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent';            
        } else if (this.type == 'StopIntent'){
            return handlerInput.requestEnvelope.request.type === 'IntentRequest'
                && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent';
        } else if (this.type == 'SessionEndedRequest') {
            return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
        } else if (this.type == 'NavigateHomeIntent'){
            return handlerInput.requestEnvelope.request.type === 'IntentRequest'
                && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.NavigateHomeIntent';
        } else if (this.type == 'CustomInterfaceController.EventsReceived' ){
            return handlerInput.requestEnvelope.request.type === 'CustomInterfaceController.EventsReceived';
        } else if (this.type == 'CustomInterfaceController.Expired' ){
            return handlerInput.requestEnvelope.request.type === 'CustomInterfaceController.Expired';
        } else if (this.type == 'UserEvent') {
            return handlerInput.requestEnvelope.request.type === 'Alexa.Presentation.APL.UserEvent'
                && handlerInput.requestEnvelope.request.source.id === this.matcher;
        }else{
            return handlerInput.requestEnvelope.request.type === 'IntentRequest'
                && handlerInput.requestEnvelope.request.intent.name === this.type;
        }
    }

    async handle(handlerInput) {
        console.log('handle: ' + this.type + '.' + this.matcher + ' called');
//        console.log(handlerInput);
        try{
            return await this.myhandle(handlerInput);
        }catch(error){
            console.error(error);
            throw error;
        }
    }
}
  
const ErrorHandler = {
    canHandle() {
        return true;
    },

    handle(handlerInput, error) {
        console.log(`Error handled: ${error.message}`);
        console.log(handlerInput);
        console.log(`type: ${handlerInput.requestEnvelope.request.type}`);
        return handlerInput.responseBuilder
            .speak('よく聞き取れませんでした。')
            .reprompt('もう一度お願いします。')
            .getResponse();
    },
};

module.exports = AlexaUtils;

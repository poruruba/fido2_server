'use strict';

class ClovaUtils{
    constructor(clova){
        this.clova = clova;
        this.clovaSkillHandler = clova.Client.configureSkill();
        this.launchHandle = null;
        this.eventHandle = null;
        this.sessionEndedHandle = null;
        this.intentHandles = new Map();

        this.clovaSkillHandler
        .onLaunchRequest(async responseHelper => {
            if( this.launchHandle ){
                console.log('handle: LaunchRequest called');
                return await this.launchHandle(responseHelper);
            }
        })
        .onIntentRequest(async responseHelper => {
            const intent = responseHelper.getIntentName();

            var handle = this.intentHandles.get(intent);
            if( handle ){
                console.log('handle: ' + intent + ' called');
                return await handle(responseHelper);
            }
        })
        .onSessionEndedRequest(async responseHelper => {
            if( this.sessionEndedHandle ){
                console.log('handle: SessionEndedRequest called');
                return await this.sessionEndedHandle(responseHelper);
            }
        })
        .onEventRequest(async responseHelper => {
            if( this.eventHandle ){
                console.log('handle: EventRequest called');
                return await this.eventdHandle(responseHelper);
            }
        });
    }

    intent( matcher, handle ){
        if( matcher == 'LaunchRequest')
            this.launchHandle = handle;
        else if( matcher == 'SessionEndedRequest')
            this.sessionEndedHandle = handle;
        else if( matcher == 'EventRequest')
            this.eventHandle = handle;
        else
            this.intentHandles.set(matcher, handle);
    }

    getAttributes( responseHelper ){
        return responseHelper.getSessionAttributes();
    }

    setAttributes( responseHelper, attributes){
        responseHelper.setSessionAttributes(attributes);
    }

    getSlots( responseHelper ){
        return responseHelper.getSlots();
    }

    handle(){
        return this.clovaSkillHandler.handle();
    }

    lambda(){
        return this.clovaSkillHandler.lambda();
    }
};

module.exports = ClovaUtils;

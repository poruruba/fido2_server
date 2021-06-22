class AlexaSmartHomeUtils{
    constructor(){
        this.intentHandles = new Map();
    }

    intent( matcher, handle ){
        this.intentHandles.set(matcher, handle);
    }

    handle(){
        return async (handlerInput, context) => {
            var intent = handlerInput.directive.header.namespace + '.' + handlerInput.directive.header.name;
            console.log('intent: ' + intent);
            var handler = this.intentHandles.get(intent);
            if( handler )
                return handler(handlerInput, context);
        }
    }
}

module.exports = AlexaSmartHomeUtils;

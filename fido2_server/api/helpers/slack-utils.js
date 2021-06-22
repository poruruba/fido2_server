'use strict';

const fetch = require('node-fetch');
const { WebClient } = require('@slack/web-api');

class SlackUtils{
    constructor(verification_token, access_token){
        this.web = new WebClient(access_token);
        this.verification_token = verification_token;
        this.map = new Map();
    }

    async initialize(){
        if( this.my_bot_id )
            return Promise.resolve();

        return this.web.auth.test()
        .then(result =>{
            this.my_user_id = result.user_id;
            console.log('userid=' + this.my_user_id);
            return this.web.users.info({user: result.user_id})
        })
        .then(result =>{
            this.my_app_id = result.user.profile.api_app_id;
            console.log('appid=' + this.my_app_id);
            return this.web.bots.info({bot: result.user.profile.bot_id})
        })
        .then(result =>{
            this.my_bot_id = result.bot.id;
            console.log('botid=' + this.my_bot_id);
        })
        .catch(error =>{
            console.log(error);
        });
    }

    postMessage(message){
        return this.web.chat.postMessage(message);
    }

    dialogOpen(options){
        return this.web.dialog.open(options);
    }

    incomingMessage(webhook_url, body){
        return this.responseMessage(webhook_url, body);        
    }

    responseMessage(response_url, body){
        return fetch(response_url, {
            method : 'POST',
            body : JSON.stringify(body),
            headers: { "Content-Type" : "application/json; charset=utf-8" } 
        })
        .then((response) => {
            if( response.status != 200 )
                throw 'status is not 200';
            return response.text();
        });
    }

    ackResponse(){
        var response = {
            statusCode: 200,
            headers: { "Content-Type": "text/plain" },
            body: ""
        };
        return response;
    }

    message(handler){
        this.map.set('message', handler);
    }

    action(handler){
        this.map.set('action', handler);
    }

    response(handler){
        this.map.set('response', handler);
    }

    command(handler){
        this.map.set('command', handler);
    }

    submission(handler){
        this.map.set('submission', handler);
    }

    cancellation(handler){
        this.map.set('cancellation', handler);
    }

    lambda(){
        return async (event, context, callback) => {
            await this.initialize();
            
            var body;
            if( context.awsRequestId )
//                body = this.decodeForm(event.body);
                body = JSON.parse(event.body);
            else
                body = JSON.parse(event.body);
            if( body.payload )
                body = JSON.parse(body.payload);
            
            if( body.token != this.verification_token )
                return;
            
            if( body.type == 'url_verification' ){
                var response = {
                    statusCode: 200,
                    headers: { "Content-Type": "text/plain" },
                    body: body.challenge
                };
                return response;                
            }

            console.log('body.user_id', body.user_id);
            if( body.event )
                console.log('body.event.user', body.event.user);
            if( body.user )
                console.log('body.user.id', body.user.id);
            console.log(JSON.stringify(body));

            if( body.user_id == this.my_user_id || (body.event && body.event.user == this.my_user_id ) )
                return this.ackResponse();

            var type = 'message';
            if( body.event && body.event.message )
                type = 'response';
            if( body.command )
                type = 'command';
            if( body.type == 'block_actions' )
                type = "action";
            if( body.type == 'dialog_submission')
                type = "submission";
            if( body.type == 'dialog_cancellation')
                type = "cancellation";

            var handler = this.map.get(type);
            if( handler )
                handler(body, this.web);
            else
                console.log(type + ' is not defined.');

            callback(null, this.ackResponse());
        }
    }

    decodeForm(body){
        var temp = body.split('&');
        var params = [];
        for( var i = 0 ; i < temp.length ; i++){
            var index = temp[i].indexOf('=');
            var key = decodeURIComponent(temp[i].substr(0, index));
            var value = decodeURIComponent(temp[i].substring(index + 1));
            if( !params[key] )
                params[key] = value;
            else if( Array.isArray(params[key]))
                params[key].push(value);
            else
                params[key] = [params[key], value];
        }
        
        return params;
    }
};

module.exports = SlackUtils;
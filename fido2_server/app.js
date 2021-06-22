'use strict';

const express = require('express');
const path = require('path');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const session = require('express-session');
const fs = require('fs');
const { graphqlHTTP } = require('express-graphql');
const cors = require('cors');
require('dotenv').config();

const app = express();

//app.use(logger('tiny', { stream: fs.createWriteStream(path.join(__dirname, 'access.log'), { flags: 'a' }) }));
app.use(logger('dev')); // for development
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static( path.join(__dirname, 'public')));
app.use(cors());

const SESSION_SECRET_KEY = process.env.SESSION_SECRET_KEY || 'secret_key';
app.use(session({
    secret: SESSION_SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: true }
}));

process.env.THIS_BASE_PATH = __dirname;
console.log('THIS_BASE_PATH: ' + process.env.THIS_BASE_PATH);
const routing = require(process.env.THIS_BASE_PATH + '/api/controllers/routing');

const BASE_PATH = process.env.BASE_PATH || '/';
app.use(BASE_PATH, routing);

const schema_list = require(process.env.THIS_BASE_PATH + '/api/controllers/routing_graphql');
schema_list.forEach( element => {
  app.use(element.endpoint, graphqlHTTP({
    schema: element.schema,
    graphiql: true, // for development
  }));
  console.log(element.endpoint + " graphql handler");
});

app.all('*', function(req, res) {
//  console.log(req);
  console.log('Unknown Endpoint');
  console.log('\tmethod=' + req.method);
  console.log('\tendpoint=' + req.params[0]);
  res.sendStatus(404);
});

var port = Number(process.env.PORT) || 10080;
app.listen(port, () =>{
  console.log('http PORT=' + port)
})

const https = require('https');
try{
  const options = {
    key:  fs.readFileSync('./cert/privkey.pem'),
    cert: fs.readFileSync('./cert/cert.pem'),
    ca: fs.readFileSync('./cert/chain.pem')
  };
  const sport = Number(process.env.SPORT) || 10443;
  const servers = https.createServer(options, app);
  console.log('https PORT=' + sport );
  servers.listen(sport);
}catch(error){
//  console.log(error);
  console.log('can not load https');
}

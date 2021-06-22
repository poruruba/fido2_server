'use strict';

const THIS_BASE_PATH = process.env.THIS_BASE_PATH;

const HELPER_BASE = process.env.HELPER_BASE || '../../helpers/';
const Response = require(HELPER_BASE + 'response');

const swagger_utils = require(HELPER_BASE + 'swagger_utils');
const fs = require('fs');

const SWAGGER_FILE = THIS_BASE_PATH + "/api/swagger/swagger.yaml";
const CONTROLLERS_BASE = THIS_BASE_PATH + '/api/controllers/';
const TARGET_FNAME = "swagger.yaml";

exports.handler = async (event, context, callback) => { 
  const root_file = fs.readFileSync(SWAGGER_FILE, 'utf-8');
  const root = swagger_utils.parse_document(root_file);

  root.contents.set("host", event.headers.host);
  root.contents.set("basePath", event.stage);
  
  swagger_utils.delete_paths(root);
  swagger_utils.delete_definitions(root);
  
  const files = fs.readdirSync(CONTROLLERS_BASE);
  files.forEach(item => {
    const stats_dir = fs.statSync(CONTROLLERS_BASE + item);
    if( !stats_dir.isDirectory() )
      return;
    try{
      fs.statSync(CONTROLLERS_BASE + item + '/' + TARGET_FNAME );
    }catch(error){
      return;
    }
  
    const file = fs.readFileSync(CONTROLLERS_BASE + item + '/' + TARGET_FNAME, 'utf-8');
    const doc = swagger_utils.parse_document(file);

    swagger_utils.append_paths(root, doc, item);
    swagger_utils.append_definitions(root, doc, item);
  });

  return new Response(root);
}

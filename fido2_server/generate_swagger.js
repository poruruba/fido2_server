'use strict';

const HELPER_BASE = process.env.HELPER_BASE || './api/helpers/';

const SWAGGER_FILE = "api/swagger/swagger.yaml";
const TARGET_FNAME = "swagger.yaml";

const fs = require('fs');
const swagger_utils = require(HELPER_BASE + 'swagger_utils');

const root_file = fs.readFileSync(SWAGGER_FILE, 'utf-8');
const root = swagger_utils.parse_document(root_file);

var num = 0;

num += swagger_utils.delete_paths(root);
num += swagger_utils.delete_definitions(root);

const files = fs.readdirSync("api/controllers");
for( var i = 0 ; i < files.length ; i++ ){
  var stats_dir = fs.statSync("api/controllers/" + files[i]);
  if( !stats_dir.isDirectory() )
    continue;
  try{
    fs.statSync("api/controllers/" + files[i] + '/' + TARGET_FNAME );
  }catch(error){
    continue;
  }

  const file = fs.readFileSync("api/controllers/" + files[i] + '/' + TARGET_FNAME, 'utf-8');
  const doc = swagger_utils.parse_document(file);
  num += swagger_utils.append_paths(root, doc, files[i]);
  num += swagger_utils.append_definitions(root, doc, files[i]);
};

if( num == 0 ){
  console.log(SWAGGER_FILE + ' no changed');
  return;
}

var swagger = String(root);
fs.writeFileSync(SWAGGER_FILE, swagger, 'utf-8');
console.log(SWAGGER_FILE + ' merged');

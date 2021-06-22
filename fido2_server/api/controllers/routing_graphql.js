'use strict';

const THIS_BASE_PATH = process.env.THIS_BASE_PATH;
const CONTROLLERS_BASE = THIS_BASE_PATH + '/api/controllers/';
const GRAPHQL_TARGET_FNAME = "schema.graphql";

const DEFAULT_HANDLER = "handler";

const fs = require('fs');
const { makeExecutableSchema } = require('graphql-tools');
const { parse, GraphQLError } = require('graphql');

function parse_graphql() {
  let schema_list = [];

  // schema.graphqlの検索
  const folders = fs.readdirSync(CONTROLLERS_BASE);
  folders.forEach(folder => {
    if( !fs.existsSync(CONTROLLERS_BASE + folder) )
      return;
    const stats_dir = fs.statSync(CONTROLLERS_BASE + folder);
    if (!stats_dir.isDirectory())
      return;

    try {
      const fname = CONTROLLERS_BASE + folder + "/" + GRAPHQL_TARGET_FNAME;
      if( !fs.existsSync(fname) )
        return;
      const stats_file = fs.statSync(fname);
      if (!stats_file.isFile())
        return;

      const typeDefs = fs.readFileSync(fname).toString();

      // schema.graphqlの解析
      const gqldoc = parse(typeDefs);
//      console.log(JSON.stringify(gqldoc, null, 2));
      const handler = require(CONTROLLERS_BASE + folder);

      let resolvers = {};
      let num_of_resolve = 0;
      let endpoint = "/" + folder; // default endpoint
      gqldoc.definitions.forEach(element1 =>{
        if( element1.kind == 'SchemaDefinition'){
          // endpoint(Schema部)の解析
          const h1 = element1.directives.find(item => item.name.value == 'endpoint');
          if( h1 ){
            const h2 = h1.arguments.find(item => item.name.value == 'endpoint');
            if( h2 ){
              endpoint = h2.value.value;
            }
          }
          return;
        }

        if( element1.kind != 'ObjectTypeDefinition' && element1.kind != "ObjectTypeExtension" ){
          return;
        }

        const define_name = element1.name.value;
        if( define_name != 'Query' && define_name != 'Mutation' )
          return;
            
        // handler(Object部)の解析
        let object_handler = {
          handler: DEFAULT_HANDLER,
          type: "normal"
        };
        const h1 = element1.directives.find(item => item.name.value == 'handler');
        if( h1 ){
          const h2 = h1.arguments.find(item => item.name.value == 'handler');
          if( h2 ){
            object_handler.handler = h2.value.value;
          }
          const h3 = h1.arguments.find(item => item.name.value == 'type');
          if( h3 ){
            object_handler.type = h3.value.value;
          }
        }

        if( !resolvers[define_name] )
          resolvers[define_name] = {};

        element1.fields.forEach( element2 =>{
          if( element2.kind != 'FieldDefinition')
            return;

          // resolverの設定
          const field_name = element2.name.value;
          resolvers[define_name][field_name] = (parent, args, context, info) =>{
            return routing(object_handler.type, handler[object_handler.handler], parent, args, context, info);
          };
          num_of_resolve++;
        });
      });

      if( num_of_resolve <= 0 )
        return;

      const executableSchema = makeExecutableSchema({
        typeDefs: [handlerDirective, gqldoc],
        resolvers: resolvers
      });

      schema_list.push({
        schema: executableSchema,
        endpoint: endpoint
      });
    } catch (error) {
      console.log(error);
    }
  });

  return schema_list;
}

function routing(type, handler, parent, args, context, info){
  console.log('[' + info.path.typename + '.' + info.path.key + ' calling]');

  try{
    var task = null;
    var func_response, func_error;
  
    if( type == "normal" ){
      task = handler(parent, args, context, info);
    }else
    if( type == "lambda" ){
      var lambda_event = {
        arguments: args,
        request: {
          headers: context.headers
        },
        info : {
          parentTypeName: info.parentType,
          fieldName: info.field
        }
      };
      const lambda_context = {
        succeed: (msg) => {
            console.log('succeed called');
            func_response = msg;
        },
        fail: (error) => {
            console.log('failed called');
            func_error = error;
        },
        context: context,
        info: info
      };

      task = handler(lambda_event, lambda_context, (error, response) =>{
        console.log('callback called', response);
        if( error )
          func_error = error;
        else
          func_response = response;
      });
    }

    if( task instanceof Promise || (task && typeof task.then === 'function') ){
      return task.then(ret => {
        console.log('promise is called');
        if( func_response || ret ){
          return func_response || ret;
        }else{
          if( func_error )
            throw func_error;
          else
            return null;
        }
      })
      .catch(error =>{
        console.log('error throwed: ' + error);
        if( error instanceof GraphQLError )
          throw error;
        else
          throw new GraphQLError(error);
      });
    }else{
      console.log('return called');
      return task;
    }
  }catch(error){
    console.log('error throwed: ' + error);
    if( error instanceof GraphQLError )
      throw error;
    else
      throw new GraphQLError(error);
  }
}

const handlerDirective = `
  directive @handler(
    handler: String, type: String
  ) on OBJECT
  directive @endpoint(
    endpoint: String
  ) on SCHEMA
`;

module.exports = parse_graphql();

'use strict';

const HELPER_BASE = process.env.HELPER_BASE || '../../helpers/';
const TextResponse = require(HELPER_BASE + 'textresponse');

const THIS_BASE_PATH = process.env.THIS_BASE_PATH;
const CONTROLLERS_BASE = THIS_BASE_PATH + '/api/controllers/';
const GRAPHQL_TARGET_FNAME = "schema.graphql";

const fs = require('fs');
const { parse } = require('graphql');

exports.handler = async (event, context, callback) => {
  let graphql_list = [];

  // schema.graphqlの検索
  const folders = fs.readdirSync(CONTROLLERS_BASE);
  folders.forEach(folder => {
    if (!fs.existsSync(CONTROLLERS_BASE + folder))
      return;
    const stats_dir = fs.statSync(CONTROLLERS_BASE + folder);
    if (!stats_dir.isDirectory())
      return;

    try {
      const fname = CONTROLLERS_BASE + folder + "/" + GRAPHQL_TARGET_FNAME;
      if (!fs.existsSync(fname))
        return;
      const stats_file = fs.statSync(fname);
      if (!stats_file.isFile())
        return;

      const typeDefs = fs.readFileSync(fname).toString();

      // schema.graphqlの解析
      const gqldoc = parse(typeDefs);
      //      console.log(JSON.stringify(gqldoc, null, 2));

      let endpoint = "/graphql_" + folder; // default endpoint
      gqldoc.definitions.forEach(element1 => {
        if (element1.kind == 'SchemaDefinition') {
          // endpoint(Schema部)の解析
          const h1 = element1.directives.find(item => item.name.value == 'endpoint');
          if (h1) {
            const h2 = h1.arguments.find(item => item.name.value == 'endpoint');
            if (h2) {
              endpoint = h2.value.value;
            }
          }
          return;
        }

      });

      graphql_list.push({
        folder: folder,
        endpoint: endpoint
      });
    } catch (error) {
      console.log(error);
    }
  });

  var html = "<h1>graphql explorer</h1>";
  graphql_list.map(item => {
    html += `<a href='..${item.endpoint}'>${item.folder}</a><br>`;
  });
  return new TextResponse("text/html", html);
};

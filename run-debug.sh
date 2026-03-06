#!/bin/sh
docker exec b25b0fca3b1c sh -c 'cat > /tmp/q.js << SCRIPT
var Client = require("pg").Client;
var c = new Client({connectionString: process.env.DATABASE_URL});
c.connect().then(function(){
  return c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \$\$database_table_227\$\$ ORDER BY ordinal_position");
}).then(function(r){
  r.rows.forEach(function(row){ console.log(row.column_name.padEnd(25) + " " + row.data_type); });
  return c.end();
}).catch(function(e){ console.error(e.message); process.exit(1); });
SCRIPT
node /tmp/q.js'

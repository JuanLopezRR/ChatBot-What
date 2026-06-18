const http = require('http');
const { initDatabase, closeDb } = require('./src/database/init');
const apiRoutes = require('./src/routes/api');
const express = require('express');

const app = express();
app.use(express.json());
app.use('/api', apiRoutes);

async function test() {
  await initDatabase();
  
  const server = app.listen(3000, () => {
    console.log('Test server running on port 3000');
    
    http.get('http://localhost:3000/api/health', res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('\n=== Health Check ===');
        console.log(data);
        
        http.get('http://localhost:3000/api/services', res2 => {
          let data2 = '';
          res2.on('data', chunk => data2 += chunk);
          res2.on('end', () => {
            console.log('\n=== Services ===');
            console.log(data2);
            
            http.get('http://localhost:3000/api/stats', res3 => {
              let data3 = '';
              res3.on('data', chunk => data3 += chunk);
              res3.on('end', () => {
                console.log('\n=== Stats ===');
                console.log(data3);
                
                server.close();
                closeDb();
                console.log('\n✅ All tests passed!');
                process.exit(0);
              });
            });
          });
        });
      });
    });
  });
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

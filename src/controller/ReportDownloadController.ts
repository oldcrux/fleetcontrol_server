// const { Readable } = require('stream');

// function getDataStream() {
//     const readable = new Readable({
//       read() {}
//     });
  
//     // Fetch data in chunks and push it to the stream
//     fetchDataInChunks((chunk) => {
//       readable.push(chunk);
//     }, () => {
//       readable.push(null); // Signal the end of the stream
//     });
  
//     return readable;
//   }

// async function fetchDataInChunks(onData, onEnd) {
//     const limit = 1000;
//     let page = 0;
  
//     while (true) {
//       const data = await fetchDataWithPagination(page, limit);
//       if (data.length === 0) {
//         break;
//       }
//       onData(data);
//       page++;
//     }
//     onEnd();
//   }
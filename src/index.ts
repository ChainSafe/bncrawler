import yargs from 'yargs';
import figlet from 'figlet';
import { render } from './charts/screen.js';
import { Crawler } from './crawler/crawler.js';

// #TODO: Show this and node crawler spinner then render charts
// const crawler =  await Crawler.init({
//   //db: 'sequalize',
//   ///discv5Opts:
// });

// figlet('Beacon Node Crawler', (err, data) => {
//   if (err) {
//     console.error(`Failed to generate header: ${err}`);
//     process.exit(1);
//   }

//   console.log(data);
// });


render()
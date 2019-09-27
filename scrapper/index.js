


const siteUrl = "https://remoteok.io/";
const axios = require("axios");
const fetchData = async () => {
  const result = await axios.get(siteUrl);
  return cheerio.load(result.data);
};


const $ = await fetchData();
const postJobButton = $('.top > .action-post-job').text();
console.log(postJobButton) // Logs 'Post a Job'
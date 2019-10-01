// var express = require('express');
// var app = express();
// var bodyParser = require('body-parser');
// const request = require('request');
// var routes = require('./routes');

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const uuidv1 = require('uuid/v1');
const app = express()
var elasticsearch = require('elasticsearch');
var client = new elasticsearch.Client({
	host: 'localhost:9200'
})
require('array.prototype.flatmap').shim();
// const getResults = require("scraper");
const port = 3000;

// app.get('/', function (req, res) {
//   res.send('Hello World')
// })

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.set('view engine', 'ejs')
// app.use( '/api', routes );

app.use( (req, res, next) => {
	console.log("Request -> "+req.method, req.url);
	next();
} )

app.listen(port, () => console.log('App Listening on port '+port) );


const cheerio = require("cheerio");
const axios = require("axios");

// const siteUrl = "https://remoteok.io/";

let siteName = "";
const blocks = new Set();


const fetchData = async (scrapURL) => {
  const result = await axios.get(scrapURL);
  return cheerio.load(result.data);
};

//Scrap Sitemap
const getResults = async (scrapURL) => {
  
  
  const $ = await fetchData(scrapURL);
  
  // image\\:image
  $("url").each((index, element) => {
    // tags.add($(element).text());
    blocks.add( { 
    	loc:$(element).find('loc').text(),
    	title:$(element).find('image\\:title').html(),
    	image_link:$(element).find('image\\:loc').html(),
    	caption:$(element).find('image\\:caption').html() 
    } );
    // image_link.add( $(element).find('image\\:loc').html() );
  });

  return {
    blocks: [...blocks].sort(),
  };
};

app.get("/testscrap", async function(req, res, next) {
  const result = await getResults('https://naasongs.com/post-sitemap.xml');
  res.send( result);
});


app.get('/login',function(req,res){
	res.render('login');
})

app.get('/web-insert',function(req,res){
	//timeout start
	setTimeout(function(){

		searchBody = {
			"size" : 1000,
		  	"query": {
		         "match_all" : {}
		       	}
			};
		search('websites', searchBody)
		  .then(results => {
		    res.render('insert_web', {websites:results,status: '2',cc:'',message:'' } );
		  })
		  .catch(console.error);

	}, 1000); //timeout end


})

app.post('/insertweb',function(req,res){
	var website = req.body.website_name;
	var language = req.body.language;

	var docBody = {};

	docBody['website_name'] = website;
	docBody['language'] = language;

	client.index({
		index: 'websites',
		type: 'url',
		id: uuidv1(),	
		body: docBody
	}, function(err) {
		if( err ) {
			console.log(err);
			res.redirect('/web-insert');

		} else {
			res.redirect('/web-insert');
		}
	});

})

app.post( '/website/view', function(req,res){

	var doc_id = req.body.update_id;

	client.get({
	  index: 'websites',
	  type: 'url',
	  id: doc_id
	}, function (error, response) {
		if( error ) {
			console.log(error);
	  		res.status(200).send("error-"+error);
		} else {
			var doc_id = response['_id'];
			var wn = response['_source']['website_name'];
			var lang = response['_source']['language'];
	  		res.status(200).render( 'update_web' ,{doc_id: doc_id,wn:wn,lang:lang,response:response,status:'',cc:''});
		}

	});

})



app.post('/updatewebsite', function(req, res){
	var doc_id =  req.body.doc_id;
	var wn =  req.body.website_name;
	var lang =  req.body.language;

	var docBody = {};

	docBody['website_name'] = wn; 
	docBody['language'] = lang; 
	
	// res.send(docBody);

	client.index({
		index: 'websites',
		type: 'url',
		id: doc_id,
		body: docBody
	}, function(err) {
		if( err ) {
			console.log(err);
			res.status(200).send(err);
		} else {

			res.status(200).send(" <form action='/website/view' method='POST'> <input type='hidden' value='"+doc_id+"' name='update_id'> <center> <input type='submit' value='Website Updated Go Back >> ' name='submit' style='font-size:14px;padding:10px;'> </center> </form> ");
		}
	});


})



app.post( '/website/delete' , function(req,res){
	var del_id = req.body.del_id;
	console.log("Deleting document ID: "+del_id);
	client.delete({
	  index: 'websites',
	  type: 'url',
	  id: del_id,
	})

	// res.status(200).send("Deleting Document : "+del_id);
	res.redirect('/web-insert');

})

// =SITEMAP START====================================================================

app.post('/website/sitemaps', async function(req,res){

	var website_id = req.body.website_id;
	// var sitemaps = '';

	let fetchWebsiteSitemaps = {
			"size" : 10,
			"query" : {
			    "term" : {
			      "website_id.keyword" : {
			        "value" : website_id
			      }
			    }
			}
		};

		fetch_sitemaps = [];
		fs = await search('website_sitemaps', fetchWebsiteSitemaps)
		  .then(results => {
		    
		    fetch_sitemaps = results['hits']['hits'];

		    
		  })
		  .catch(console.error);


	client.get({
	  index: 'websites',
	  type: 'url',
	  id: website_id
	}, function (error, response) {
		if( error ) {
			console.log(error);
	  		res.status(200).send("error-"+error);
		} else {
			var website_id = response['_id'];
			var wn = response['_source']['website_name'];
			var lang = response['_source']['language'];
	  		res.status(200).render( 'website_sitemaps' ,{wn:wn,lang:lang,website_id:website_id,sitemaps:fetch_sitemaps,status:'',cc:''});
		}

	});

	// res.status(200).render( 'website_sitemaps' ,{wn:wn,lang:lang,sitemaps:sitemaps,status:'',cc:''});

})


async function runInsertSitemapScrap (bulkArray) {

  const dataset = bulkArray;

  const body = dataset.flatMap(doc => [{ index: { _index: 'document_songs', _type: 'song_block' } }, doc])
  // const body = dataset;

  // const { body: bulkResponse } = await client.bulk({ refresh: true, body })
  const bulkInsertResponse = await client.bulk({ refresh: true, body })

  console.log(bulkInsertResponse['items'].length);

  if (bulkInsertResponse['errors']) {
    const erroredDocuments = []
    // The items array has the same order of the dataset we just indexed.
    // The presence of the `error` key indicates that the operation
    // that we did for the document has failed.
    bulkResponse.items.forEach((action, i) => {
      const operation = Object.keys(action)[0]
      if (action[operation].error) {
        erroredDocuments.push({
          // If the status is 429 it means that you can retry the document,
          // otherwise it's very likely a mapping error, and you should
          // fix the document before to try it again.
          status: action[operation].status,
          error: action[operation].error,
          operation: body[i * 2],
          document: body[i * 2 + 1]
        })
      }
    })
    console.log(erroredDocuments)
  }

  const bulkInsertCount = await client.count({ index: 'document_songs' })
  console.log(bulkInsertCount)

}

app.post('/website/add/sitemap', async function(req,res){

	var website_id = req.body.website_id;
	var website_name = req.body.website_name;
	var sitemap_ep = req.body.sitemap_ep;

	var complete_url = website_name+sitemap_ep;

	let searchBody = {
		"size" : 10,
		"query" : {
		    "term" : {
		      "websitemap.keyword" : {
		        "value" : complete_url
		      }
		    }
		}
	};

	var check_sitemap_data = [];
	var check_sitemap = '';
	check_sitemap = await search('website_sitemaps', searchBody)
	  .then(results => {
	    
	    check_sitemap_data = results['hits']['hits'].length;

	    
	  })
	  .catch(console.error);

	if( check_sitemap_data != 0 ) {
		res.send("Sitemap already exist");
	} else {

		//scrap sitemap
		const result = await getResults(complete_url);
	  	// res.send( result['blocks'] );

		// var website = req.body.website_name;
		// var language = req.body.language;
		var docBody = {};
		// elasticStore(inputArray);
		var bulkArray  = [];
		for(i=0; i<result['blocks'].length;i++) {
			docBody = {}
			docBody['websitename'] = website_name;
			docBody['websitemap'] = complete_url;
			docBody['location'] = result['blocks'][i]['loc'];
			docBody['title'] = result['blocks'][i]['title'];
			docBody['image_link'] = result['blocks'][i]['image_link'];
			docBody['caption'] = result['blocks'][i]['caption'];
			bulkArray.push(docBody);
		}

		//Insert Blocks
		runInsertSitemapScrap(bulkArray).catch(console.log);
		
		var itemsInserted = bulkArray.length;
		let date_ob = new Date();
		smBody = {};
		smBody['website_id'] = website_id;
		smBody['websitename'] = website_name; 
		smBody['websitemap'] = complete_url; 
		smBody['sm_endpoint'] = sitemap_ep; 
		smBody['items_discovered'] = itemsInserted; 
		smBody['date_inserted'] = date_ob;
		smBody['last_read'] = date_ob;

		var sm_summ = await client.index({
			index: 'website_sitemaps',
			type: 'sitemaps_summary',
			// id: uuidv1(),	
			id: complete_url,	
			body: smBody
		}, function(err) {
			if( err ) {
				console.log(err);
			} else {
				console.log("sitemap: "+complete_url+" has been crawled and added.");
			}
		});



		let fetchWebsiteSitemaps = {
			"size" : 10,
			"query" : {
			    "term" : {
			      "website_id.keyword" : {
			        "value" : website_id
			      }
			    }
			}
		};

		fetch_sitemaps = [];
		fs = await search('website_sitemaps', fetchWebsiteSitemaps)
		  .then(results => {
		    
		    fetch_sitemaps = results['hits']['hits'];

		    
		  })
		  .catch(console.error);

		console.log(sm_summ);
		
		client.get({
		  index: 'websites',
		  type: 'url',
		  id: website_id
		}, function (error, response) {
			if( error ) {
				console.log(error);
		  		res.status(200).send("error-"+error);
			} else {
				var website_id = response['_id'];
				var wn = response['_source']['website_name'];
				var lang = response['_source']['language'];
		  		res.status(200).render( 'website_sitemaps' ,{wn:wn,lang:lang,website_id:website_id,sitemaps:fetch_sitemaps,status:'',cc:''});
			}

		});


	} // end od else of check sitemap exist or not

})


// =SITEMAP END====================================================================

app.get('/', function(req, res){
		// res.status(200).render('index',{results:'',search_str:'', message:''});
	searchBody = {
		"size" : 1000,
	  	"query": {
	         "match_all" : {}
	       	}
		};
	search('websites', searchBody)
	  .then(results => {
	    // console.log(`found ${results.hits.total} items in ${results.took}ms`);
	    // console.log(`returned article titles:`);
	    // console.log(results);
	    res.render('index', {results:results, search_str:req.body.search, message:'All Documents'} );
	    // res.send(results['hits']['hits'][0]);
	    // results.hits.hits.forEach(
	    //   (hit, index) => console.log(
	    //     `\t${body.from + ++index} - ${hit._source.id}`
	    //   )
	    // )
	  })
	  .catch(console.error);
})

app.get('/insert', function(req, res){
		res.status(200).render('insert',{status: '2',cc:''});
})

app.post('/insertdocument', function(req, res){
	var df =  req.body.Docfields;

	var docBody = {};

	for(i=0;i<df.length;i++) {
		docBody['d'+(i+1)] = df[i]; 
	}

	// res.status(200).send(docBody);

	client.index({
		index: 'mydocument',
		type: 'mytype',
		id: uuidv1(),
		body: docBody
	}, function(err) {
		if( err ) {
			console.log(err);
			res.status(200).render('insert',{status: '0',cc: 'alert-danger'});
		} else {
			res.status(200).render('insert',{status: '1',cc: 'alert-success'});
		}
	});

})

app.post( '/document/view', function(req,res){

	var doc_id = req.body.update_id;

	client.get({
	  index: 'mydocument',
	  type: 'mytype',
	  id: doc_id
	}, function (error, response) {
		if( error ) {
			console.log(error);
	  		res.status(200).send("error-"+error);
		} else {
			var doc_id = response['_id'];
	  		res.status(200).render( 'update' ,{doc_id: doc_id ,response:response,status:'',cc:''});
		}

	});

})


app.post('/updatedocument', function(req, res){
	var doc_id =  req.body.doc_id;
	var df =  req.body.Docfields;

	var docBody = {};

	for(i=0;i<df.length;i++) {
		docBody['d'+(i+1)] = df[i]; 
	}

	console.log(df);

	client.index({
		index: 'mydocument',
		type: 'mytype',
		id: doc_id,
		body: docBody
	}, function(err) {
		if( err ) {
			console.log(err);
			res.status(200).send(err);
		} else {

				// request.post('/document/view', {
				//   update_id: doc_id
				// }, (error, res, body) => {
				//   if (error) {
				//     console.error(error);
    // 				return
				//   }
				// })

			res.status(200).send(" <form action='/document/view' method='POST'> <input type='hidden' value='"+doc_id+"' name='update_id'> <center> <input type='submit' value='Document Updated Go Back >> ' name='submit' style='font-size:14px;padding:10px;'> </center> </form> ");
		}
	});


})


app.post( '/document/delete' , function(req,res){
	var del_id = req.body.del_id;
	console.log("Deleting document ID: "+del_id);
	client.delete({
	  index: 'mydocument',
	  type: 'mytype',
	  id: del_id,
	})

	// res.status(200).send("Deleting Document : "+del_id);
	res.status(200).render('index', {results:'',search_str:'', message: 'Successfully Deleted Document (ID:'+del_id+')' } );

})

const search = function search(index, body) {
  return client.search({index: index, body: body});
};

app.post('/general_search', function(req, res){

	var search_arr = req.body.search.split(" ");

	let searchBody = {
		"size" : 10,
		"min_score":0.5,
  		"query": {
         	"bool": {
            	"should": [
                	// {
                 //   		"multi_match": {
                 //      		"type": "best_fields",
                 //      		"query": "ssss-wwww-ssdd-oo-pppd",
                 //      		"operator": "and"
                 //   		}
                	// },
                	// {
                	// 	"multi_match": {
                 //      		"type": "best_fields",
                 //   			"query": "bbbb-qqqq-rrrr-eeee-ssss",
                 //   			"operator": "and"
                	// 	}
                	// }
  
             	]

          	}
       	}
	};

	if( req.body.search != '' ){

		if(search_arr) {
			for(i=0; i<search_arr.length; i++) {
		      // console.log(search_arr[i]);
		      searchBody['query']['bool']['should'].push({
								                		"multi_match": {
								                   			"query": search_arr[i],
								                      		"type": "best_fields",
								                   			"operator": "and"
								                		}
								                	});
		    }
		}

	} else {
		searchBody = {
		"size" : 1000,
	  	"query": {
	         "match_all" : {}
	       	}
		};
	}
	

	search('mydocument', searchBody)
	  .then(results => {
	    // console.log(`found ${results.hits.total} items in ${results.took}ms`);
	    // console.log(`returned article titles:`);
	    // console.log(results);
	    res.render('index', {results:results, search_str:req.body.search, message:''} );
	    // res.send(results['hits']['hits'][0]);
	    // results.hits.hits.forEach(
	    //   (hit, index) => console.log(
	    //     `\t${body.from + ++index} - ${hit._source.id}`
	    //   )
	    // )
	  })
	  .catch(console.error);

})
 
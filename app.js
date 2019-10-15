// var express = require('express');
// var app = express();
// var bodyParser = require('body-parser');
// const request = require('request');
// var routes = require('./routes');

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const uuidv1 = require('uuid/v1');
const app = express();
var path = require('path');

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
app.use(express.static(path.join(__dirname, 'public')));
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
// var blocks = new Set();


var fetchData = async (scrapURL) => {
  // const result = await axios.get(scrapURL);
  // return cheerio.load(result.data);
  
  	try {
    var result = await axios.get(scrapURL);
    // Success
    // console.log(result);
  	return cheerio.load(result.data);
	} catch (error) {
		console.log("INVALID URL!");
		return cheerio.load('<invalid>invalid</invalid>');
	}

};

//Scrap Sitemap
var getResults = async (scrapURL) => {
  var blocks = new Set();
  
  var $ = await fetchData(scrapURL);

  var invalid = $("invalid").html();
  console.log($("invalid").html());
  
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
    invalid:invalid
  };
};


//Scrap Single url
var fetchData_single = async (scrapURL) => {
  // const result = await axios.get(scrapURL);
  // return cheerio.load(result.data);
  
  	try {
    var result = await axios.get(scrapURL);
    // Success
    // console.log(result);
  	return cheerio.load(result.data);
	} catch (error) {
		console.log("INVALID URL!");
		return cheerio.load('<invalid>invalid</invalid>');
	}

};

//Scrap Sitemap
var getResults_single = async (scrapURL) => {
  // var block_single = new Set();\
  var articleBody = '';
  
  var $ = await fetchData_single(scrapURL);

  var invalid = $("invalid").html();
  console.log($("invalid").html());
  
  // find('div[itemprop=articleBody]').text();
  articleBody = $('body').find('div[itemprop=articleBody]').text());
  // image\\:image
  // $("div").each((index, element) => {
  //   // tags.add($(element).text());
  //   block_single.add( { 
  //   	desc:$(element).find('loc').text(),
  //   	title:$(element).find('image\\:title').html(),
  //   	image_link:$(element).find('image\\:loc').html(),
  //   	caption:$(element).find('image\\:caption').html() 
  //   } );
  //   // image_link.add( $(element).find('image\\:loc').html() );
  // });

  return {
    articleBody: articleBody,
    invalid:invalid
  };
};


app.get("/testscrap", async function(req, res, next) {
  const result = await getResults_single('https://naasongs.com/subrahmanyapuram-2018.html');
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
		  .catch(error => {
		  	res.render('insert_web', {websites:[],status: '2',cc:'',message:'' } );
		  });

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
		    
		    fetch_sitemaps = results;

		    
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

  var dataset = bulkArray;

  var body = dataset.flatMap(doc => [{ index: { _index: 'document_songs', _type: 'song_block' } }, doc])
  // const body = dataset;

  // const { body: bulkResponse } = await client.bulk({ refresh: true, body })
  var bulkInsertResponse = await client.bulk({ refresh: true, body })

  console.log(bulkInsertResponse['items'].length);

  if (bulkInsertResponse['errors']) {
    const erroredDocuments = []
    // The items array has the same order of the dataset we just indexed.
    // The presence of the `error` key indicates that the operation
    // that we did for the document has failed.
    bulkResponse.items.forEach((action, i) => {
      var operation = Object.keys(action)[0]
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
  console.log("=-=-=-=-=-=-=-");
  console.log(bulkInsertCount)
  console.log("=-=-=-=-=-=-=-");


}

app.post('/website/smtest', async function(req,res){

	// var website_id = req.body.website_id;
	// var website_name = req.body.website_name;
	// var sitemap_ep = req.body.sitemap_ep;

	// var complete_url = website_name+sitemap_ep;
	var ddd = req.body
	console.log(ddd['website_id']);
	res.send(req.body);

})

app.post('/website/add/sitemap', async function(req,res){

	var website_id = req.body.website_id;
	var website_name = req.body.website_name;
	var sitemap_ep = req.body.sitemap_ep;
	var weblanguage = req.body.language;

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
		res.send("2"); //2 = sitemap already exists
	} else {

		//scrap sitemap
		const result = await getResults(complete_url);
	  	// res.send( result['blocks'] );
	  	
		// var website = req.body.website_name;
		// var language = req.body.language;
		var docBody = {};
		// elasticStore(inputArray);
		var bulkArray  = [];
		if( result['invalid'] == 'invalid' ) {
			res.send("3"); // 3 = URL is invalid
		}else if( result ) {
			for(i=0; i<result['blocks'].length;i++) {
				docBody = {}
				docBody['websitename'] = website_name;
				docBody['websitemap'] = complete_url;
				docBody['weblanguage'] = weblanguage;
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
		smBody['weblanguage'] = weblanguage;
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
				res.send("1");
			}
		});

		} //end of invalid sitemap url check


	} // end od else of check sitemap exist or not

})

// =SITEMAP END====================================================================

// =SITEMAP Reindex Start====================================================================

app.post('/sitemap/reindex', async function(req,res){

var sitemap_id = req.body.sitemap_id;
var websitename = req.body.websitename;
var weblanguage = req.body.weblanguage;

// delete old songs blocks
  var checkdel = await client.deleteByQuery({
  index: 'document_songs',
  type: 'song_block',
  body: {
    query: {
    	term : {
		      "websitemap.keyword" : {
		        "value" : sitemap_id
		      }
		    }
    }   
  }
});

// res.send(checkdel);
console.log("========");
console.log(checkdel);
console.log("========");


setTimeout( async function(){

// }, 2000 );

//Web crawling / reindex start

//scrap sitemap
var result = await getResults(sitemap_id);
	  	// res.send( result['blocks'] );
	  	
		// var website = req.body.website_name;
		// var language = req.body.language;
var docBody1 = {};
		// elasticStore(inputArray);
var bulkArray  = [];
if( result['invalid'] == 'invalid' ) {
	res.send("3"); // 3 = URL is invalid
}else if( result ) {

	for(i=0; i<result['blocks'].length;i++) {
		docBody1 = {}
		docBody1['websitename'] = websitename;
		docBody1['websitemap'] = sitemap_id;
		docBody1['weblanguage'] = weblanguage;
		docBody1['location'] = result['blocks'][i]['loc'];
		docBody1['title'] = result['blocks'][i]['title'];
		docBody1['image_link'] = result['blocks'][i]['image_link'];
		docBody1['caption'] = result['blocks'][i]['caption'];
		bulkArray.push(docBody1);
	}

			//Insert Blocks
runInsertSitemapScrap(bulkArray).catch(console.log);
			
var itemsInserted = bulkArray.length;

  console.log("***************");
  console.log(itemsInserted+" --- "+bulkArray.length);
  console.log("***************");


// Web crawling / reindex end


//Website sitemap summary updating
var docBody = {};
var website_id = ''; 
var websitename = ''; 
var websitemap = '';
var sm_endpoint = '';
var language = '';
var date_inserted = '';

//getting sitemap summary from sitemap
await client.get({
	  index: 'website_sitemaps',
	  type: 'sitemaps_summary',
	  id: sitemap_id
	}, function (error, response) {
		if( error ) {
			console.log(error);

		} else {
			// var doc_id = response['_id'];
			console.log(response);
			
			docBody['websitemap']= sitemap_id; //complete url
			docBody['sm_endpoint']= response['_source']['sm_endpoint'];
			docBody['website_id']= response['_source']['website_id'];
			docBody['websitename']= response['_source']['websitename'];
			docBody['weblanguage']= response['_source']['weblanguage'];
			docBody['date_inserted']= response['_source']['date_inserted'];
			docBody['last_read']= new Date();
			docBody['items_discovered']= itemsInserted;

			client.index({
					index: 'website_sitemaps',
					type: 'sitemaps_summary',
					id: sitemap_id,	
					body: docBody
				}, function(err) {
					if( err ) {
						console.log(err);
						res.status(500).send(err);

					} else {
						res.send('1');
					}
				});

		}

	});

} //end of invalid sitemap url check

}, 2000 );
	

})

// =SITEMAP Reindex END====================================================================

// =SITEMAP Search Page START====================================================================

app.get('/searchpage', async function(req,res){

	var q = req.query.q;
	var label = req.query.label;
	var length = req.query.length;
	var size = 10;

	if( length == 2 ) {
		length_str = 2;
		size = 20
	} else if( length == 3 ) {
		length_str = 3;
		size = 30
	} else {
		length_str = 1;
		size = 10
	}
	
	if( q ) {

	searchBody = {
		"from" : 0,
		"size" : size,
	  	"query": { 
		    "bool": { 
		      "must": [
		        { 
		          "query_string" : {
		              "query" : "*"+q+"*"
		          }
		        }
		      ]
		      //dynamically place filter here
		    }
		}
	};

	if( label ) {
		searchBody['query']['bool']['filter'] = [];
		searchBody['query']['bool']['filter'].push( { "term":  { "weblanguage": label }} );
	}

	console.log(searchBody['query']['bool']['filter']);
	

	var search_results = await search('document_songs', searchBody)
	  .then(results => {
	    
	    res.status(200).render('search_page', { data:results,q:q,label:label,length_str:length_str } );
	    
	  })
	  .catch(console.error);

	} else {
		res.status(200).render('search_page_main',{ data:[] });
	}
	// res.status(200).render('search_page');

})

app.post('/search_page_ajax', async function(req,res){

	var q = req.body.q;
	var label = req.body.label;	
	var page = req.body.page;
	var length = req.body.length;

	

	searchBody = {
		"from" : 0,
		"size" : 10,
	  	"query": { 
		    "bool": { 
		      "must": [
		        { 
		          "query_string" : {
		              "query" : "*"+q+"*"
		          }
		        }
		      ]
		      //dynamically place filter here
		    }
		}
	};

	if( page ) {
		p_no = page;
		p_no++;
		page = page*10;
		searchBody['from'] = page;
	}

	if( label ) {
		searchBody['query']['bool']['filter'] = [];
		searchBody['query']['bool']['filter'].push( { "term":  { "weblanguage": label }} );
	}

	console.log(searchBody['query']['bool']['filter']);
	console.log(searchBody['from']);

	// res.send(searchBody);
	

	var search_results = await search('document_songs', searchBody)
	  .then(results => {
	    
	    res.status(200).send({ data:results['hits']['hits'],page:p_no });
	    // res.status(200).send({ data:results,page:p_no });
	    
	  })
	  .catch(console.error);


})



// =SITEMAP Search Page END====================================================================


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
 
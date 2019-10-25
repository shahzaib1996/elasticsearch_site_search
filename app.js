const cron = require("node-cron");

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const uuidv1 = require('uuid/v1');
var session = require('express-session')
const app = express();
var path = require('path');
var elasticsearch = require('elasticsearch');
var client = new elasticsearch.Client({
	// host: 'localhost:9200'
	host: 'http://51.158.104.138:9200/'

})
require('array.prototype.flatmap').shim();
const port = 80;

const config = require('./config.json');
var fs = require('fs');


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.set('view engine', 'ejs')
app.use(express.static(path.join(__dirname, 'public')));


app.use( (req, res, next) => {
	console.log("Request -> "+req.method, req.url);
	next();
} )

app.set('trust proxy', 1) // trust first proxy
app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true,
  cookie: {  }
}))

app.listen(port, () => console.log('App Listening on port '+port) );

const cheerio = require("cheerio");
const axios = require("axios");
var app_init = false;

let siteName = "";

async function automatic_sitemap_reindex() {
  
  searchBody = {
	"size" : 1000,
  	"query": {
         "match_all" : {}
       	}
	};
	await search('website_sitemaps', searchBody)
	  .then(results_main => {

	  	//Reindex Start 

	  	for( i=0;i<results_main['hits']['hits'].length;i++ ) {

	  		console.log('Start Sitemap Reindex '+results_main['hits']['hits'][i]['_id']);


		var sitemap_id = results_main['hits']['hits'][i]['_id'];
		var websitename = results_main['hits']['hits'][i]['_source']['websitename'];
		var weblanguage = results_main['hits']['hits'][i]['_source']['weblanguage'];


		// delete old songs blocks
		  var checkdel = client.deleteByQuery({
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


		//Web crawling / reindex start

		//scrap sitemap
		var result = await getResults(sitemap_id);
			  	
		var docBody1 = {};
				// elasticStore(inputArray);
		var bulkArray  = [];
		if( result['invalid'] == 'invalid' ) {
			// res.send("3"); // 3 = URL is invalid
			console.log("Sitemap Invalid");
		}else if( result ) {

			for(i=0; i<result['blocks'].length;i++) {

				var description = await getResults_single(result['blocks'][i]['loc']);

				if( description['invalid'] == 'invalid' || description['articleBody'] == "" ) {
							
				} else {

					docBody1 = {}
					docBody1['websitename'] = websitename;
					docBody1['websitemap'] = sitemap_id;
					docBody1['weblanguage'] = weblanguage;
					docBody1['location'] = result['blocks'][i]['loc'];
					docBody1['title'] = result['blocks'][i]['title'];
					docBody1['image_link'] = result['blocks'][i]['image_link'];
					docBody1['caption'] = result['blocks'][i]['caption'];
					docBody1['description'] = description['articleBody'];
					bulkArray.push(docBody1);

				}
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
					console.log("Updating sitemap summary");
					
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
								console.log("Error in sitemap summary update.");
								console.log(err);

							} else {
								console.log("Sitemap Reindex Successfully. "+sitemap_id);
							}
						});

				}

			});

		} //end of invalid sitemap url check

		console.log("*End of sitemap reindex*");

		}, 2000 );
		
		
		}
	  	//reindex End
	    

	  })
  .catch(error => {

  });

}


//Cron job Function
 cron.schedule("0 5 * * *", async function() {
 		automatic_sitemap_reindex().then(console.log); // 1
      	console.log("Running a task every day 5 AM"); 
 });


var fetchData = async (scrapURL) => {
  
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

  });

  $("tr").each((index, element) => {
    // tags.add($(element).text());
    blocks.add( { 
    	loc:$(element).find('a').attr('href'),
    	title:'',
    	image_link:'',
    	caption:''
    } );

  });



  return {
    blocks: [...blocks].sort(),
    invalid:invalid
  };
};


//Scrap Single url
var fetchData_single = async (scrapURL) => {
  
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

  var articleBody = '';
  var title = '';

  var $ = await fetchData_single(scrapURL);

  var invalid = $("invalid").html();

  articleBody = $('body').find('div[itemprop=articleBody]').text();
  title = $('head').find('title').text();
  

  return {
    articleBody: articleBody,
    title: title,
    invalid:invalid
  };
};

//Scrap Single url
var fetchData_single_scrap = async (scrapURL) => {

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
var getResults_single_scrap = async (scrapURL) => {
  // var block_single = new Set();\
  var articleBody = '';
  var title = '';
  var caption = '';
  var image_link = '';

  
  var $ = await fetchData_single_scrap(scrapURL);

  var invalid = $("invalid").html();

  articleBody = $('body').find('div[itemprop=articleBody]').text();
  image_link = $('body').find('img[itemprop=image]').attr('src');
  title = $('head').find('title').text();
  caption = $('body').find('img[itemprop=image]').attr('alt');

  return {
  	title:title,
  	caption:caption,
    articleBody: articleBody,
    image_link:image_link,
    invalid:invalid
  };
};


app.get("/testscrap", async function(req, res, next) {
  const result = await getResults_single('https://naasongs.com');
  res.send( result);
});


app.get('/app/init', async function(req,res){

	var docBody = {};
	var length = {};

	if(app_init == false) {
		app_init = true;
		docBody['email'] = config['email'];
		docBody['username'] = config['username'];
		docBody['password'] = config['password'];
		length['length'] = 10;

		await client.index({
			index: 'app_config',
			type: 'config',
			id: 'search_length',	
			body: length
		}, function(err) {
			
			console.log("search length init...");

		});

		await client.index({
			index: 'app_config',
			type: 'config',
			id: 'admin',	
			body: docBody
		}, function(err) {
			if( err ) {
				console.log(err);
				res.redirect('/login');

			} else {
				res.redirect('/login');
			}
		});

	} else {
		console.log("Already app init!")
		res.redirect('/login');
	}

});


app.get('/login',function(req,res){
	if(req.session.username) {
    	res.redirect('/webinsert');
  	} else {
		res.render('login',{ status:'' });
  	}
})

app.post('/login',function(req,res){
	
	var username = req.body.username;
	var password = req.body.password;

	client.get({
	  index: 'app_config',
	  type: 'config',
	  id: 'admin'
	}, function (error, response) {
		if( error ) {
			console.log(error);
	  		res.status(200).send("error- "+error);
		} else {
			console.log(response);
			var un = response['_source']['username'];
			var pass = response['_source']['password'];
			if( un == username ) {
				if( pass == password ) { 

				req.session.username = response['_source']['username'];
				console.log(req.session.username);
				res.redirect('/webinsert'); 

				}
				else { res.render('login',{ status:'0' }); }
			} else { res.render('login',{ status:'0' }); }

		}

	});


})

app.get('/logout', function (req, res) {

	req.session.destroy(function(){
	  res.redirect('/login');
	});

})


app.get('/settings',function(req,res){
	if(req.session.username) {

		var ll = require('./length.json');

		client.get({
		  index: 'app_config',
		  type: 'config',
		  id: 'search_length'
		}, function (error, response) {
			if( error ) {
				console.log(error);
		  		res.status(200).send("error-"+error);
			} else {
				var l = response['_source']['length'];
				console.log(l)
		  		res.status(200).render( 'settings' ,{status:'',cc:'',message:'',length:ll['length']});
			}

		});

  	} else {
		res.render('login',{ status:'' });
  	}
})

app.post('/changepassword', async function(req,res){
	if(req.session.username) {
		var l = req.body.l;
		var op = req.body.o_p;
		var np = req.body.n_p;
		await client.get({
		  index: 'app_config',
		  type: 'config',
		  id: 'admin'
		}, function (error, response) {
			if( error ) {
				console.log(error);
		  		res.status(200).send("error-"+error);
			} else {
				var  dBody = {};
				dBody['email'] = response['_source']['email'];
				dBody['username'] = response['_source']['username'];
				var pp = response['_source']['password'];
				if( op == pp ) {
					dBody['password'] = np;
					console.log(dBody);
					client.index({
						index: 'app_config',
						type: 'config',
						id: 'admin',	
						body: dBody
					}, function(err) {
						if( err ) {
							console.log(err);
							res.status(200).render( 'settings' ,{status:'1',cc:'alert-danger',message:'Something Went Wrong!',length:l});

						} else {
							res.status(200).render( 'settings' ,{status:'1',cc:'alert-success',message:'Password Changed!',length:l});
						}
					});

				} else {
			  		res.status(200).render( 'settings' ,{status:'1',cc:'alert-danger',message:'Wrong Password!',length:l});
				}
			}

		});

  	} else {
		res.render('login',{ status:'',message:'' });
  	}
})


app.post('/updatelength', async function(req,res){
	if(req.session.username) {
		var length = req.body.length;
		var dBody = {};
		dBody['length'] = length;
		
		json = '{ "length":'+length+' }';
		var jsonObj = JSON.parse(json);
		// stringify JSON Object
		var jsonContent = JSON.stringify(jsonObj);
		var fs = require('fs');
		fs.writeFile('./length.json', jsonContent, 'utf8', function(){
			res.redirect('/settings');
		});
				

  	} else {
		res.render('login',{ status:'',message:'' });
  	}
})


app.get('/webinsert',function(req,res){
	console.log(req.session.username);
	if(!(req.session.username)) {
    	res.redirect('/login');
  	} else {


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

  	}


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
			res.redirect('/webinsert');

		} else {
			res.redirect('/webinsert');
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



app.post( '/website/delete' , async function(req,res){
	var del_id = req.body.del_id;
	console.log("Deleting document ID: "+del_id);
	client.delete({
	  index: 'websites',
	  type: 'url',
	  id: del_id,
	})

	var checkdel = await client.deleteByQuery({
	  index: 'website_sitemaps',
	  type: 'sitemaps_summary',
	  body: {
	    query: {
	    	term : {
			      "website_id.keyword" : {
			        "value" : del_id
			      }
			    }
	    }   
	  }
	});

	var checkdel = await client.deleteByQuery({
	  index: 'document_songs',
	  type: 'song_block',
	  body: {
	    query: {
	    	term : {
			      "website_id.keyword" : {
			        "value" : del_id
			      }
			    }
	    }   
	  }
	});

	res.redirect('/webinsert');

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

    bulkResponse.items.forEach((action, i) => {
      var operation = Object.keys(action)[0]
      if (action[operation].error) {
        erroredDocuments.push({

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

	var ddd = req.body
	console.log(ddd['website_id']);
	res.send(req.body);

})

app.post('/website/add/sitemap', async function(req,res){

	var website_id = req.body.website_id;
	var website_name = req.body.website_name;
	var sitemap_ep = req.body.sitemap_ep;
	var weblanguage = req.body.language;

	console.log("WEbsite ID:"+ website_id);

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
		var result = await getResults(complete_url);
	  	
		var docBody = {};
		// elasticStore(inputArray);
		var bulkArray  = [];
		if( result['invalid'] == 'invalid' ) {
			res.send("3"); // 3 = URL is invalid
		}else if( result ) {
			for(i=0; i<result['blocks'].length;i++) {

				// articleBody
				//scrap single url
				var description = await getResults_single(result['blocks'][i]['loc']);

				if( description['invalid'] == 'invalid' || description['articleBody'] == "" ) {
					
				} else {

					docBody = {}
					docBody['website_id'] = website_id;
					docBody['websitename'] = website_name;
					docBody['websitemap'] = complete_url;
					docBody['weblanguage'] = weblanguage;
					docBody['location'] = result['blocks'][i]['loc'];
					// docBody['title'] = result['blocks'][i]['title']; //old
					docBody['title'] = description['title']; //new
					docBody['image_link'] = result['blocks'][i]['image_link'];
					docBody['caption'] = result['blocks'][i]['caption'];
					docBody['description'] = description['articleBody'];
					bulkArray.push(docBody);
					
				}

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
var website_id = req.body.website_id;
	
console.log("WEbsite ID:"+ website_id);

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


//Web crawling / reindex start

//scrap sitemap
var result = await getResults(sitemap_id);
	  	
var docBody1 = {};
		// elasticStore(inputArray);
var bulkArray  = [];
if( result['invalid'] == 'invalid' ) {
	res.send("3"); // 3 = URL is invalid
}else if( result ) {

	for(i=0; i<result['blocks'].length;i++) {

		var description = await getResults_single(result['blocks'][i]['loc']);

		if( description['invalid'] == 'invalid' || description['articleBody'] == "" ) {
					
		} else {

			docBody1 = {}
			docBody1['website_id'] = website_id;
			docBody1['websitename'] = websitename;
			docBody1['websitemap'] = sitemap_id;
			docBody1['weblanguage'] = weblanguage;
			docBody1['location'] = result['blocks'][i]['loc'];
			docBody1['title'] = description['title']; //new
			docBody1['image_link'] = result['blocks'][i]['image_link'];
			docBody1['caption'] = result['blocks'][i]['caption'];
			docBody1['description'] = description['articleBody'];
			bulkArray.push(docBody1);

		}
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

//
// get Length function
async function getlength() {
	var l = 10;
	await client.get({
	  index: 'app_config',
	  type: 'config',
	  id: 'search_length'
	}, function (error, response) {
		if( error ) {
			console.log(error);
		} else {
			console.log("response++");
			console.log(response);
			var l = response['_source']['length'];
			// return l;
		}

	});

}

// =SITEMAP Search Page START====================================================================

app.get('/', async function(req,res){

	// var length = await getlength();
	var dt = require('./length.json');

	// console.log(dt);

	var length = dt['length'];
	
	// console.log("This is length:"+length);
	var q_ori = req.query.q;
	var q = req.query.q;
	var label = req.query.label;
	// var length = req.query.length;
	var size = 10;

	
	length_str = 1;
	size = length
	
	
	if( q ) {
	// console.log("This is size:"+size);
	q = q.toLowerCase();
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

	  	for(i=0;i<results['hits']['hits'].length;i++) {
	  		delete results['hits']['hits'][i]['_source']['website_id'];
	  		delete results['hits']['hits'][i]['_source']['websitemap'];
	  	}


	    save_search_stats(q,results['hits']['total']['value'],label	)
	    res.status(200).render('search_page', { data:results,q:q_ori,label:label,length_str:length_str } );
	    // res.status(200).render('new_search_page', { data:results,q:q_ori,label:label,length_str:length_str } );
	    
	  })
	  .catch(error => {
	  	res.status(200).render('search_page', { data:[],q:q_ori,label:label,length_str:length_str } );
	  });

	} else {
		res.status(200).render('search_page_main',{ data:[] });
	}


})

function save_search_stats(q,result_count,lang) {

	if( lang == '' ) {
		lang = 'all';
	}

	console.log("Search stats");
	
	var docBody = {};
	docBody['search_term'] = q;
	docBody['result_count'] = result_count;
	docBody['language'] = lang;
	docBody['date_searched'] = new Date();

	client.index({
		index: 'search_stats',
		type: 'stats',	
		body: docBody
	}, function(err) {
		if( err ) {
			console.log(err);

		} else {
			console.log("Search stats Saved!");
		}
	});

}

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

// =SITEMAP Single Entry END====================================================================

app.get('/single_entry',async function(req,res){


	let searchBody = {
		"query" : {
		    "term" : {
		      "websitemap.keyword" : {
		        "value" : "manual"
		      }
		    }
		}
	};

	check_sitemap = await search('document_songs', searchBody)
	  .then(results => {
	    
	    res.render('single_entry',{results:results});
	    
	  })
	  .catch(console.error);

})



app.post('/single/site/add', async function(req,res){

	var website_url = req.body.website_url;
	var weblanguage = req.body.language;

	var complete_url = website_url;

	let searchBody = {
		"size" : 10,
		"query" : {
		    "bool" : {
		      "must" : [
		        {
		          "term" : {
		            "websitemap.keyword" : {
		              "value" : "manual"
		            }
		          }
		        },
		        {
		          "term" : {
		            "location.keyword" : {
		              "value" : complete_url
		            }
		          }
		        }
		      ]
		    }
		}
	};

	var check_sitemap_data = 0;
	var check_sitemap = '';
	check_sitemap = await search('document_songs', searchBody)
	  .then(results => {
	    
	    check_sitemap_data = results['hits']['hits'].length;
	    // res.send(results);

	    
	  })
	  .catch(console.error);

	if( check_sitemap_data != 0 ) {
		res.send("2"); //2 = sitemap already exists
	} else {

		//scrap sitemap
		var result = await getResults_single_scrap(complete_url);
	  	// res.send( result['blocks'] );

		console.log(result);
		if( result['invalid'] == 'invalid' ) {
			res.send("3"); // 3 = URL is invalid
		}else if( result ) {
			

		let date_ob = new Date();
		smBody = {};
		smBody['websitemap'] = "manual";
		smBody['location'] = complete_url;
		smBody['weblanguage'] = weblanguage; 
		smBody['title'] = result['title']; 
		smBody['image_link'] = result['image_link'];
		smBody['description'] = result['articleBody']; 
		smBody['caption'] = result['caption']; 
		smBody['date_inserted'] = date_ob;
		smBody['last_read'] = date_ob;

		var sm_summ = await client.index({
			index: 'document_songs',
			type: 'song_block',
			// id: uuidv1(),	
			// id: ,	
			body: smBody
		}, function(err) {
			if( err ) {
				console.log(err);
			} else {
				console.log("Web URL : "+complete_url+" has been crawled and added.");
				res.send("1");
			}
		});

		} //end of invalid sitemap url check


	} // end od else of check sitemap exist or not

})

app.post('/single/site/reindex', async function(req,res){

var singleid = req.body.singleid;
var location = req.body.location;
var weblanguage = req.body.weblanguage;
var submitted = req.body.submitted;


//scrap sitemap
		var result = await getResults_single_scrap(location);

		console.log(result);
		if( result['invalid'] == 'invalid' ) {
			res.send("3"); // 3 = URL is invalid
		}else if( result ) {
				

		let date_ob = new Date();
		smBody = {};
		smBody['websitemap'] = "manual";
		smBody['location'] = location;
		smBody['weblanguage'] = weblanguage; 
		smBody['title'] = result['title']; 
		smBody['image_link'] = result['image_link'];
		smBody['description'] = result['articleBody']; 
		smBody['caption'] = result['caption'];
		smBody['date_inserted'] = submitted;
		smBody['last_read'] = date_ob;

		var sm_summ = await client.index({
			index: 'document_songs',
			type: 'song_block',
			// id: uuidv1(),
			id: singleid,	
			body: smBody
		}, function(err) {
			if( err ) {
				console.log(err);
			} else {
				console.log("Web URL : "+location+" has been crawled and added.");
				res.send("1");
			}
		});

		} //end of invalid sitemap url check

	
})

app.post('/single/web/delete', async function(req,res){

	var singleid = req.body.singleid;

	// delete old songs blocks
  var checkdel = await client.deleteByQuery({
	  index: 'document_songs',
	  type: 'song_block',
	  body: {
	    "query" : {
		    "bool" : {
		      "must" : [
		        {
		          "term" : {
		            "websitemap.keyword" : {
		              "value" : "manual"
		            }
		          }
		        },
		        {
		          "term" : {
		            "_id" : {
		              "value" : singleid
		            }
		          }
		        }
		      ]
		    }
		  }   
	  }
	});

  res.send('1');

})


// =SITEMAP Single Entry END====================================================================

// =Search Stats  Start====================================================================

app.get('/stats', function(req,res){

	res.render('search_stats');
	  
})

app.post('/stats/fetch', function(req,res){

	searchBody = {
		"size" : 1000,
	  	"query": {
	         "match_all" : {}
	       	}
		};
	search('search_stats', searchBody)
	  .then(results => {

	    res.send( results );

	  })
	  .catch(error => {
	  	var results = [];
	  	res.send( [] );
	  });

})

app.post('/stats/fetch/range', function(req,res){
	var from = req.body.from;
	var to = req.body.to;
	var language = req.body.language;

	searchBody = {
		"size" : 1000,
		"query": {
		  	"bool": {
			    "must": [
			        {
			          "range" : {
				            "date_searched" : {
				                "gte" : from,
				                "lte" : to
				            }
				        }
			        }
			        
			    ]
			}
		}
	  	
	};

	if( language != '' ) {
		searchBody['query']['bool']['must'].push( {
										          "term": {
										            "language": language
										          }
										        });
	}


	search('search_stats', searchBody)
	  .then(results => {

	    res.send( results );

	  })
	  .catch(error => {
	  	var results = [];
	  	res.send( [] );
	  });

})

//stats delete
app.post('/stats/delete', async function(req,res){

	// delete old songs blocks
  var checkdel = await client.deleteByQuery({
	  index: 'search_stats',
	  type: 'stats',
	  body: {
	    "query": {
	        "match_all" : {}
	    }  
	  }
	});

  res.send('1');

})

// Delete Single URl 
app.post('/url/delete/entry', async function(req,res){

	var delete_url = req.body.delete_url;

	// delete old songs blocks
  var checkdel = await client.deleteByQuery({
	  index: 'document_songs',
	  type: 'song_block',
	  body: {
	    "query" : {
		    "bool" : {
		      "must" : [
		        {
		          "term" : {
		            "location.keyword" : {
		              "value" : delete_url
		            }
		          }
		        }
		      ],
		      "must_not" : [
		        {
		          "term" : {
		            "websitemap.keyword" : {
		              "value" : "manual"
		            }
		          }
		        }
		      ]
		    }
		  }   
	  }
	});

  res.send('1');

})

// =Search Stats END====================================================================

const search = function search(index, body) {
  return client.search({index: index, body: body});
};


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
// const port = 807;
const port = 80;

const config = require('./config.json');
var fs = require('fs');
var lff = require('./length.json');
var slength = lff['length'];

var server_config = require('./server_config.json');
var smaintenance_mode = server_config['maintenance'];

var re_mod = require('./result_model.json');
var sresult_model = re_mod['result_model'];

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

var server = app.listen(port, () => console.log('App Listening on port '+port) );
server.timeout = 1000 * 60 * 10;

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

		let sitemap_id = results_main['hits']['hits'][i]['_id'];
		let website_id = results_main['hits']['hits'][i]['_source']['website_id']
		let websitename = results_main['hits']['hits'][i]['_source']['websitename'];
		let weblanguage = results_main['hits']['hits'][i]['_source']['weblanguage'];


		// delete old songs blocks
		  let checkdel = client.deleteByQuery({
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
		let result = await getResults(sitemap_id);
			  	
		let docBody1 = {};
				// elasticStore(inputArray);
		let bulkArray  = [];
		if( result['invalid'] == 'invalid' ) {
			// res.send("3"); // 3 = URL is invalid
			console.log("Sitemap Invalid");
		}else if( result ) {

			for(i=0; i<result['blocks'].length;i++) {

				let description = await getResults_single(result['blocks'][i]['loc']);

				if( description['invalid'] == 'invalid' || description['articleBody'] == "" ) {
							
				} else {

					let docBody1 = {}
					docBody1['website_id'] = website_id;
					docBody1['websitename'] = websitename;
					docBody1['websitemap'] = sitemap_id;
					docBody1['weblanguage'] = weblanguage;
					docBody1['location'] = result['blocks'][i]['loc'];
					// docBody1['title'] = result['blocks'][i]['title'];
					// docBody1['image_link'] = result['blocks'][i]['image_link'];
					docBody1['title'] = description['title']; //new
					// docBody1['image_link'] = description['image_link'];

					if( description['image_link'] != null && description['image_link'] != undefined ) {
						let aurr = description['image_link'].split('/');
						if( aurr[0] == 'https:' || aurr[0] == 'http:' ) {
						  docBody1['image_link'] = description['image_link'];
						} else {
						  docBody1['image_link'] = result['blocks'][i]['loc'].split('/')[0]+'//'+result['blocks'][i]['loc'].split('/')[2]+'/'+description['image_link'];
						}
					} else {
						docBody1['image_link'] = description['image_link'];
					}
					// docBody1['image_link'] = sitemap_id.split('/')[2]+description['image_link'];

					docBody1['caption'] = result['blocks'][i]['caption'];
					docBody1['description'] = description['articleBody'];
					bulkArray.push(docBody1);

				}
			}

					//Insert Blocks
		runInsertSitemapScrap(bulkArray).catch(console.log);
					
		let itemsInserted = bulkArray.length;

		  console.log("***************");
		  console.log(itemsInserted+" --- "+bulkArray.length);
		  console.log("***************");


		// Web crawling / reindex end

		//Website sitemap summary updating
		let docBody = {};
		// let website_id = ''; 
		// let websitename = ''; 
		// let websitemap = '';
		// let sm_endpoint = '';
		// let language = '';
		// let date_inserted = '';

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
 cron.schedule("0 0 0 * * *", async function() {
 		// automatic_sitemap_reindex().then(console.log); // 1
      	console.log("Running a task every day 12 AM"); 
 });


var fetchData = async (scrapURL) => {
  
  	try {
    let result = await axios.get(scrapURL);
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
  let blocks = new Set();
  
  let $ = await fetchData(scrapURL);

  let invalid = $("invalid").html();
  console.log($("invalid").html());
  
  // image\\:image
  $("url").each((index, element) => {
    // tags.add($(element).text());
    console.log("Loc Loc Loc Loc Loc Loc -> "+ $(element).find('loc').text());
    if( $(element).find('loc').text() != '' && $(element).find('loc').text() != null ) {
	    blocks.add( { 
	    	loc:$(element).find('loc').text(),
	    	// title:$(element).find('image\\:title').html(), // we are not using  
	    	// image_link:$(element).find('image\\:loc').html(),
	    	caption:$(element).find('image\\:caption').html() 
	    } );
    }

  });

  // $("tr").each((index, element) => {
  //   // tags.add($(element).text());
  //   blocks.add( { 
  //   	loc:$(element).find('a').attr('href'),
  //   	// title:'',
  //   	// image_link:'',
  //   	caption:''
  //   } );

  // });


  return {
    blocks: [...blocks].sort(),
    invalid:invalid
  };
};


//Scrap Single url
var fetchData_single = async (scrapURL) => {
  
  	try {
    let result = await axios.get(scrapURL);
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

  let articleBody = '';
  let title = '';

  let $ = await fetchData_single(scrapURL);

  let invalid = $("invalid").html();

  articleBody = $('body').find('div[itemprop=articleBody]').text();
  image_link = $('body').find('img[itemprop=image]').attr('src');
  title = $('head').find('title').text();

  if( articleBody == '' || articleBody == null ) {
  	articleBody = $('body').find('article').text();
  }
  
  if( articleBody == '' || articleBody == null ) {
  	articleBody = $('body').text();
  }

  if( image_link == '' || image_link == null ) {
  	image_link = $('body').find('article[itemprop=blogPost]').find('img').attr('src');
  } 

  if( image_link == '' || image_link == null ) {
  	image_link = $('body').find('article').find('img').attr('src');
  }

  if( image_link == '' || image_link == null ) {
  	image_link = $('body').find('img').attr('src');
  }

  return {
    articleBody: articleBody,
    title: title,
    image_link:image_link,
    invalid:invalid
  };
};

//Scrap Single url
var fetchData_single_scrap = async (scrapURL) => {

  	try {
    let result = await axios.get(scrapURL);
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
  let articleBody = '';
  let title = '';
  let caption = '';
  let image_link = '';

  
  let $ = await fetchData_single_scrap(scrapURL);

  let invalid = $("invalid").html();

  articleBody = $('body').find('div[itemprop=articleBody]').text();
  image_link = $('body').find('img[itemprop=image]').attr('src');
  title = $('head').find('title').text();
  caption = $('body').find('img[itemprop=image]').attr('alt');

  if( articleBody == '' || articleBody == null ) {
  	articleBody = $('body').find('article').text();
  }

  if( articleBody == '' || articleBody == null ) {
  	articleBody = $('body').text();
  }

  if( image_link == '' || image_link == null ) {
  	image_link = $('body').find('article[itemprop=blogPost]').find('img').attr('src');
  }

  if( image_link == '' || image_link == null ) {
  	image_link = $('body').find('article').find('img').attr('src');
  }

  if( image_link == '' || image_link == null ) {
  	image_link = $('body').find('img').attr('src');
  }

  console.log("------articleBody-------");
  console.log(articleBody);
  console.log("------articleBody-------++|>");
  
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

	let docBody = {};
	let length = {};

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
				res.redirect('/i-login');

			} else {
				res.redirect('/i-login');
			}
		});

	} else {
		console.log("Already app init!")
		res.redirect('/i-login');
	}

});


app.get('/i-login',function(req,res){
	if(req.session.username) {
    	res.redirect('/webinsert');
  	} else {
		res.render('login',{ status:'' });
  	}
})

app.post('/i-login',function(req,res){
	
	var username = req.body.username;
	var password = req.body.password;

	client.get({
	  index: 'app_config',
	  type: 'config',
	  id: 'admin'
	}, function (error, response) {
		if( error ) {
			console.log(error);
	  		res.status(200).send("Error - "+error);
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
	  res.redirect('/i-login');
	});

})


app.get('/settings',function(req,res){
	if(req.session.username) {

		// var ll = require('./length.json');
		let ll = slength;
		let mm = smaintenance_mode;
		let rr = sresult_model;

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
		  		res.status(200).render( 'settings' ,{status:'',cc:'',message:'',length:ll,maintenance:mm,result_model:rr});
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
				let  dBody = {};
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
							res.status(200).render( 'settings' ,{status:'1',cc:'alert-danger',message:'Something Went Wrong!',length:l,maintenance:smaintenance_mode,result_model:sresult_model});
							

						} else {
							let json = '{ "email": "example@gmail.com", "username": "admin", "password": "'+dBody['password']+'" }';
							let jsonObj = JSON.parse(json);
							// stringify JSON Object
							let jsonContent = JSON.stringify(jsonObj);
							let fs = require('fs');
							fs.writeFile('./config.json', jsonContent, 'utf8', function(){
								res.status(200).render( 'settings' ,{status:'1',cc:'alert-success',message:'Password Changed!',length:l,maintenance:smaintenance_mode,result_model:sresult_model});
							});

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
		slength = req.body.length;
		console.log(slength)

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
    	res.redirect('/i-login');
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

	var checkdel1 = await client.deleteByQuery({
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
	}, function (error, response) {
	  	
	  	if( error ) {
	  		console.log("Website entries deleted failed !"+error)
	  	} else {
	  		console.log("Website entries deleted!")
	  	}

	});


	var checkdel2 = await client.deleteByQuery({
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
	}, function (error, response) {
	  		
	  	if( error ) {
	  		console.log("Website sitemap deleted failed !"+error)
	  	} else {
	  		console.log("Website sitemap deleted!")
	  	}

	});
	
	
	var checkdel3 = await client.delete({
	  index: 'websites',
	  type: 'url',
	  id: del_id,
	}, function (error, response) {
	  	if( error ) {
	  		console.log("Website delete failed!")
	  		res.redirect('/webinsert');
	  	} else {
	  		console.log("Website delete!")
	  		res.redirect('/webinsert');
	  	}
	  	// res.redirect('/webinsert');

	})


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

  let dataset = bulkArray;

  let body = dataset.flatMap(doc => [{ index: { _index: 'document_songs', _type: 'song_block' } }, doc])
  // const body = dataset;

  // const { body: bulkResponse } = await client.bulk({ refresh: true, body })
  let bulkInsertResponse = await client.bulk({ refresh: true, body })

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

	// var website_id = req.body.website_id;
	// var website_name = req.body.website_name;
	// var sitemap_ep = req.body.sitemap_ep;
	// var weblanguage = req.body.language;

	console.log("WEbsite ID:"+ req.body.website_id);

	let complete_url = req.body.website_name+req.body.sitemap_ep;

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

	let check_sitemap_data = [];
	let check_sitemap = '';
	check_sitemap = await search('website_sitemaps', searchBody)
	  .then(results => {
	    
	    check_sitemap_data = results['hits']['hits'].length;

	    
	  })
	  .catch(console.error);

	if( check_sitemap_data != 0 ) {
		res.send("2"); //2 = sitemap already exists
	} else {

		//scrap sitemap
		let result = await getResults(complete_url);
	  	
		let docBody = {};
		// elasticStore(inputArray);
		let bulkArray  = [];
		if( result['invalid'] == 'invalid' ) {
			res.send("3"); // 3 = URL is invalid
		}else if( result ) {
			for(i=0; i<result['blocks'].length;i++) {

				// articleBody
				//scrap single url
				if(result['blocks'][i]['loc']){
					let description = await getResults_single(result['blocks'][i]['loc']);
					if( description['invalid'] == 'invalid' || description['articleBody'] == "" ) {
						
					} else {

						let new_docBody = {}
						// docBody['website_id'] = website_id;
						// docBody['websitename'] = website_name;
						// docBody['websitemap'] = complete_url;
						// docBody['weblanguage'] = weblanguage;

						new_docBody['website_id'] = req.body.website_id;
						new_docBody['websitename'] = req.body.website_name;
						new_docBody['websitemap'] = complete_url;
						new_docBody['weblanguage'] = req.body.language;

						console.log("url number count --++--++ "+i);

						new_docBody['location'] = result['blocks'][i]['loc'];
						new_docBody['title'] = description['title']; //new
						// docBody['image_link'] = description['image_link'];

						if( description['image_link'] != null && description['image_link'] != undefined ) {
							let brr = description['image_link'].split('/');
							if( brr[0] == 'https:' || brr[0] == 'http:' ) {
							  new_docBody['image_link'] = description['image_link'];
							} else {
							  new_docBody['image_link'] = result['blocks'][i]['loc'].split('/')[0]+'//'+result['blocks'][i]['loc'].split('/')[2]+'/'+description['image_link'];
							}
						} else {
							new_docBody['image_link'] = description['image_link'];
						}

						// new_docBody['image_link'] = result['blocks'][i]['loc'].split('/')[2]+description['image_link'];
						new_docBody['caption'] = result['blocks'][i]['caption'];
						new_docBody['description'] = description['articleBody'];
						bulkArray.push(new_docBody);
						
					}
				}

			}

			//Insert Blocks
			runInsertSitemapScrap(bulkArray).catch(console.log);
			
		let itemsInserted = bulkArray.length;
		let date_ob = new Date();
		let smBody = {};
		smBody['website_id'] = req.body.website_id;
		smBody['websitename'] = req.body.website_name; 
		smBody['websitemap'] = complete_url; 
		smBody['sm_endpoint'] = req.body.sitemap_ep;
		smBody['weblanguage'] = req.body.language;
		smBody['items_discovered'] = itemsInserted; 
		smBody['date_inserted'] = date_ob;
		smBody['last_read'] = date_ob;

		let sm_summ = await client.index({
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

console.log("WEbsite ID: ");
console.log(req.body);

// let sitemap_id = req.body.sitemap_id;
// let websitename = req.body.websitename;
// let weblanguage = req.body.weblanguage;
// let website_id = req.body.website_id;
	
// console.log("WEbsite ID:"+ website_id);

// delete old songs blocks
  let checkdel = await client.deleteByQuery({
  index: 'document_songs',
  type: 'song_block',
  body: {
    query: {
    	term : {
		      "websitemap.keyword" : {
		        "value" : req.body.sitemap_id
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
let result = await getResults(req.body.sitemap_id);
	  	
// let docBody1 = {};
		// elasticStore(inputArray);
let bulkArray  = [];
if( result['invalid'] == 'invalid' ) {
	res.send("3"); // 3 = URL is invalid
}else if( result ) {

	for(var i=0; i<result['blocks'].length;i++) {

		if( result['blocks'][i]['loc'] ){
			let description = await getResults_single(result['blocks'][i]['loc']);
			if( description['invalid'] == 'invalid' || description['articleBody'] == "" ) {
						
			} else {
				// console.log(description);
				let reindex_docBody1 = {}
				// docBody1['website_id'] = website_id;
				// docBody1['websitename'] = websitename;
				// docBody1['websitemap'] = sitemap_id;
				// docBody1['weblanguage'] = weblanguage;
				reindex_docBody1['website_id'] = req.body.website_id;
				reindex_docBody1['websitename'] = req.body.websitename;
				reindex_docBody1['websitemap'] = req.body.sitemap_id;
				reindex_docBody1['weblanguage'] = req.body.weblanguage;

				console.log("url count --++-- "+i);

				reindex_docBody1['location'] = result['blocks'][i]['loc'];
				reindex_docBody1['title'] = description['title']; //new
				// reindex_docBody1['image_link'] = description['image_link'];

				if( description['image_link'] != null && description['image_link'] != undefined ) {
					let rerr = description['image_link'].split('/');
					if( rerr[0] == 'https:' || rerr[0] == 'http:' ) {
					  reindex_docBody1['image_link'] = description['image_link'];
					} else {
					  reindex_docBody1['image_link'] = result['blocks'][i]['loc'].split('/')[0]+'//'+result['blocks'][i]['loc'].split('/')[2]+'/'+description['image_link'];
					}
				} else {
					reindex_docBody1['image_link'] = description['image_link'];
				}
				// reindex_docBody1['image_link'] = result['blocks'][i]['loc'].split('/')[2]+description['image_link'];
				
				reindex_docBody1['caption'] = result['blocks'][i]['caption'];
				reindex_docBody1['description'] = description['articleBody'];
				bulkArray.push(reindex_docBody1);

			}
		}
	}

			//Insert Blocks
runInsertSitemapScrap(bulkArray).catch(console.log);
			
let itemsInserted = bulkArray.length;

console.log("***************");
console.log(itemsInserted+" --- "+bulkArray.length);
console.log("***************");


// Web crawling / reindex end


//Website sitemap summary updating
let docBody_reindex_summary = {};
// let website_id = ''; 
// let websitename = ''; 
// let websitemap = '';
// let sm_endpoint = '';
// let language = '';
// let date_inserted = '';

//getting sitemap summary from sitemap
await client.get({
	  index: 'website_sitemaps',
	  type: 'sitemaps_summary',
	  id: req.body.sitemap_id
	}, function (error, response) {
		if( error ) {
			console.log("error aya ha live 1101 par");
			console.log(error);

		} else {
			// var doc_id = response['_id'];
			console.log("old sitemap summary ===>");
			console.log(response);
			console.log("old sitemap summary end <===");
			
			docBody_reindex_summary['websitemap']= req.body.sitemap_id; //complete url
			docBody_reindex_summary['sm_endpoint']= response['_source']['sm_endpoint'];
			docBody_reindex_summary['website_id']= response['_source']['website_id'];
			docBody_reindex_summary['websitename']= response['_source']['websitename'];
			docBody_reindex_summary['weblanguage']= response['_source']['weblanguage'];
			docBody_reindex_summary['date_inserted']= response['_source']['date_inserted'];
			docBody_reindex_summary['last_read']= new Date();
			docBody_reindex_summary['items_discovered']= itemsInserted;

			console.log(docBody_reindex_summary);

			client.index({
					index: 'website_sitemaps',
					type: 'sitemaps_summary',
					id: req.body.sitemap_id,	
					body: docBody_reindex_summary
				}, function(err) {
					if( err ) {
						console.log("Reindexing line 1115 par error aya!");
						console.log(err);
						res.status(500).send(err);

					} else {
						console.log("Reindexing line 1121 success!");
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
	console.log("MODE-> "+smaintenance_mode);
	if( smaintenance_mode == 0 ) {

		// var length = await getlength();

		// var dt = require('./length.json');

		// console.log(dt);

		let length = slength;
		
		// console.log("This is length:"+length);
		let q_ori = req.query.q;
		let q = req.query.q;
		let label = req.query.label;
		// var length = req.query.length;
		let size = 10;

		
		length_str = 1;
		size = length
		console.log(q);
		if( q ) {

			let search_result_page_model = (sresult_model==6)?'search_model_sixth':(sresult_model==5)?'search_model_fifth':(sresult_model==4)?'search_model_fourth':(sresult_model==3)?'search_model_third':(sresult_model==2)?'search_model_second':'search_model_first';

			// console.log("This is size:"+size);
			q = q.toLowerCase();

			if( (q.split(' ')).includes("mp3") || (q.split(' ')).includes("download") || (q.split(' ')).includes("song") || (q.split(' ')).includes("songs") ) {
				q = q.replace("mp3", "").replace("download", "").replace("song", "").replace("songs", "");
				console.log("inside q",q)
				
				
				searchBody2 = {
					"from" : 0,
					"size" : size,
				  	"query": { 
					    "bool": {
						    "should" : [
					            
						        {
					              "match": {
					                "location": {
					                  "query": q,
					                  "operator": "and"
					                }
					              }
						        },
						        
					            {
					              "match": {
					                "title": {
					                  "query": q,
					                  "operator": "and"
					                }
					              }
					            }
					            
					            
					            ,
					            {
					              "match": {
					                "description": {
					                  "query": q
					                }
					              }
					            },
					            
					            {
					              "match": {
					                "description": {
					                  "query": q,
					                  "operator": "and",
					                  "boost":10
					                }
					              }
					            }
						      ]
					    }
					}
				};

				searchBody = {
					"from" : 0,
					"size" : size,
				  	"query": { 
					    "bool": {
						    "should" : [
					            {
					              "query_string": {
                        "query": "*"+q+"*",
                        "default_field": "title",
                        "default_operator": "AND"
					              }
						        },
						        {
					              "query_string": {
                        "query": "*"+q+"*",
                        "default_field": "location",
                        "default_operator": "AND"
					              }
						        },
						        {
					              "query_string": {
                        "query": "*"+q+"*",
                        "default_field": "description",
                        "default_operator": "AND"
					              }
						        }
						      ]
					    }
					}
				}

			} else {

				searchBody = {
					"from" : 0,
					"size" : size,
				  	"query": { 
					    "bool": {
						    "should" : [
					            {
					              "query_string": {
                        "query": "*"+q+"*",
                        "default_field": "title",
                        "default_operator": "AND"
					              }
						        },
						        {
					              "query_string": {
                        "query": "*"+q+"*",
                        "default_field": "location",
                        "default_operator": "AND"
					              }
						        },
						        {
					              "query_string": {
                        "query": "*"+q+"*",
                        "default_field": "description",
                        "default_operator": "AND"
					              }
						        }
						      ]
					    }
					}
				}

				searchBody2 = {
					"from" : 0,
					"size" : size,
				  	"query": { 
					    "bool": {
						    "should" : [
					            {
					              "match": {
					                "location": {
					                  "query": q,
					                  // "boost": 5
					                }
					              }
						        },
						        {
					              "match": {
					                "title": {
					                  "query": q,
					                  // "boost": 5 
					                }
					              }
					            }
					            ,
					            {
					              "match": {
					                "description": {
					                  "query": q
					                }
					              }
					            }
					         //  ,
						        // { 
						        //   "query_string" : {
						        //       "query" : "*"+q+"*",
						        //       "boost": 5 
						        //   }
						        // }
						      ]
					      //dynamically place filter here
					    }
					}
				};
				
			}


			if( label ) {
				searchBody['query']['bool']['filter'] = [];
				searchBody['query']['bool']['filter'].push( { "term":  { "weblanguage": label }} );
				searchBody2['query']['bool']['filter'] = [];
				searchBody2['query']['bool']['filter'].push( { "term":  { "weblanguage": label }} );
			}

			console.log(searchBody['query']['bool']['filter']);

			let search_results = await search('document_songs', searchBody)
			  .then(results => {

			  	// for(i=0;i<results['hits']['hits'].length;i++) {
			  	// 	delete results['hits']['hits'][i]['_source']['website_id'];
			  	// 	delete results['hits']['hits'][i]['_source']['websitemap'];

			  	// 	let ut = results['hits']['hits'][i]['_source']['image_link'].split('/');
			  	// 	if( !(ut.includes("https:")) && !(ut.includes("http:")) ){
			  	// 		results['hits']['hits'][i]['_source']['image_link'] = "https://"+results['hits']['hits'][i]['_source']['image_link'];
			  	// 	}
			  	// 	results['hits']['hits'][i]['_source']['description']=results['hits']['hits'][i]['_source']['description'].replace(/\s{2,}/g, ' ');
			  	// }

			    // save_search_stats(q,results['hits']['total']['value'],label	)
			    // res.status(200).render(search_result_page_model, { data:results,q:q_ori,label:label,length_str:length_str } );
				
				//2 search start
				let search_results2 = search('document_songs', searchBody2)
				.then(results2 => {
					let second_count = 0;
					for(i=0;i<results2['hits']['hits'].length;i++) {
						if( results['hits']['hits'].length < size ){
							results['hits']['hits'].push(results2['hits']['hits'][i]);
							second_count++;
						}
					}
					results['hits']['total']['value'] = results['hits']['total']['value']+results2['hits']['total']['value'];
					results['took'] += 5;
					for(i=0;i<results['hits']['hits'].length;i++) {
						delete results['hits']['hits'][i]['_source']['website_id'];
						delete results['hits']['hits'][i]['_source']['websitemap'];

						let ut = results['hits']['hits'][i]['_source']['image_link'].split('/');
						if( !(ut.includes("https:")) && !(ut.includes("http:")) ){
							results['hits']['hits'][i]['_source']['image_link'] = "https://"+results['hits']['hits'][i]['_source']['image_link'];
						}
						results['hits']['hits'][i]['_source']['description']=results['hits']['hits'][i]['_source']['description'].replace(/\s{2,}/g, ' ');
					}


					save_search_stats(q,results['hits']['total']['value'],label	)
					res.status(200).render(search_result_page_model, { data:results,q:q_ori,label:label,length_str:length_str } );
					// res.status(200).render('new_search_page', { data:results,q:q_ori,label:label,length_str:length_str } );
					
				})
				.catch(error => {
					res.status(200).render(search_result_page_model, { data:[],q:q_ori,label:label,length_str:length_str } );
					// res.status(200).render('new_search_page', { data:[],q:q_ori,label:label,length_str:length_str } );
				});
				// 2 search end

			  })
			  .catch(error => {
			  	res.status(200).render(search_result_page_model, { data:[],q:q_ori,label:label,length_str:length_str } );
			  	// res.status(200).render('new_search_page', { data:[],q:q_ori,label:label,length_str:length_str } );
			  });

		} else {
			res.status(200).render('new_search_main',{ data:[] });
		}

	} else {
		res.send("Please try after sometime, Server is on Maintenance Mode.");
	}

})

function save_search_stats(q,result_count,lang) {

	if( lang == '' ) {
		lang = 'all';
	}

	console.log("Search stats");
	
	let statsDocBody = {};
	statsDocBody['search_term'] = q;
	statsDocBody['result_count'] = result_count;
	statsDocBody['language'] = lang;
	statsDocBody['date_searched'] = new Date();

	client.index({
		index: 'search_stats',
		type: 'stats',	
		body: statsDocBody
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

	// let website_url = req.body.website_url;
	// let weblanguage = req.body.language;

	let single_complete_url = req.body.website_url;

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
		              "value" : single_complete_url
		            }
		          }
		        }
		      ]
		    }
		}
	};

	let check_sitemap_data = 0;
	let check_sitemap = '';
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
		let result = await getResults_single_scrap(single_complete_url);

		// console.log(result);
		if( result['invalid'] == 'invalid' ) {
			res.send("3"); // 3 = URL is invalid
		}else if( result ) {
			

		let date_ob = new Date();
		let smBody = {};
		smBody['websitemap'] = "manual";
		smBody['location'] = single_complete_url;
		// smBody['weblanguage'] = weblanguage; 
		smBody['weblanguage'] = req.body.language; 
		smBody['title'] = result['title']; 
		// smBody['image_link'] = result['image_link'];
		if( result['image_link'] != null && result['image_link'] != undefined ) {
			let brr = result['image_link'].split('/');
			if( brr[0] == 'https:' || brr[0] == 'http:' ) {
			  smBody['image_link'] = result['image_link'];
			} else {
			  smBody['image_link'] = single_complete_url.split('/')[0]+'//'+single_complete_url.split('/')[2]+'/'+result['image_link'];
			}
		} else {
			smBody['image_link'] = result['image_link'];
		}

		// smBody['image_link'] = single_complete_url.split('/')[2]+result['image_link'];
		smBody['description'] = result['articleBody']; 
		smBody['caption'] = result['caption']; 
		smBody['date_inserted'] = date_ob;
		smBody['last_read'] = date_ob;

		let sm_summ = await client.index({
			index: 'document_songs',
			type: 'song_block',
			// id: uuidv1(),		
			body: smBody
		}, function(err) {
			if( err ) {
				console.log(err);
			} else {
				console.log("Web URL : "+single_complete_url+" has been crawled and added.");
				res.send("1");
			}
		});

		} //end of invalid sitemap url check

	} // end od else of check sitemap exist or not

})

app.post('/single/site/reindex', async function(req,res){

// let singleid = req.body.singleid;
// let location = req.body.location;
// let weblanguage = req.body.weblanguage;
// let submitted = req.body.submitted;


//scrap sitemap
		let result = await getResults_single_scrap(req.body.location);

		// console.log(result);
		if( result['invalid'] == 'invalid' ) {
			res.send("3"); // 3 = URL is invalid
		}else if( result ) {
				

		let date_ob = new Date();
		let single_sm_body = {};
		single_sm_body['websitemap'] = "manual";
		single_sm_body['location'] = req.body.location;
		single_sm_body['weblanguage'] = req.body.weblanguage; 
		single_sm_body['title'] = result['title']; 

		if( result['image_link'] != null && result['image_link'] != undefined ) {
			let brr = result['image_link'].split('/');
			if( brr[0] == 'https:' || brr[0] == 'http:' ) {
			  single_sm_body['image_link'] = result['image_link'];
			} else {
			  single_sm_body['image_link'] = req.body.location.split('/')[0]+'//'+req.body.location.split('/')[2]+'/'+result['image_link'];
			}
		} else {
			single_sm_body['image_link'] = result['image_link'];
		}

		// single_sm_body['image_link'] = result['image_link'];
		single_sm_body['description'] = result['articleBody']; 
		single_sm_body['caption'] = result['caption'];
		single_sm_body['date_inserted'] = req.body.submitted;
		single_sm_body['last_read'] = date_ob;

		let sm_summ = await client.index({
			index: 'document_songs',
			type: 'song_block',
			// id: uuidv1(),
			id: req.body.singleid,	
			body: single_sm_body
		}, function(err) {
			if( err ) {
				console.log(err);
			} else {
				console.log("Web URL : "+req.body.location+" has been crawled and added.");
				res.send("1");
			}
		});

		} //end of invalid sitemap url check

	
})

app.post('/single/web/delete', async function(req,res){

	let singleid = req.body.singleid;

	// delete old songs blocks
  let checkdel = await client.deleteByQuery({
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

	if(!(req.session.username)) {
    	res.redirect('/i-login');
  	} else {

		res.render('search_stats');
	
	}
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


// == Delete All indexes =====================================================================
app.post('/delete/entire/data', async function(req,res){

	await client.indices.delete({
	  index: 'document_songs',
	}).then(function(resp) {

	  console.log("Successful deleted all entries!");

	}, function(err) {


	});

	await client.indices.delete({
	  index: 'website_sitemaps',
	}).then(function(resp) {

	  console.log("Successful deleted all Sitemaps!");

	}, function(err) {


	});

	await client.indices.delete({
	  index: 'websites',
	}).then(function(resp) {

	  console.log("Successful deleted all websites!");

	}, function(err) {


	});
	console.log("Sending response!");
	res.send('1');

})


// ======== Maintenace Mode ============================================
app.post('/maintenance_status', async function(req,res){
	
	if(req.session.username) {
		smaintenance_mode = req.body.maintenance;
		console.log(smaintenance_mode)

		let maintenance_mode = req.body.maintenance;
		// let dBody = {};
		// dBody['maintenance'] = maintenance_mode;
		
		let json = '{ "maintenance":'+maintenance_mode+' }';
		let jsonObj = JSON.parse(json);
		// stringify JSON Object
		let jsonContent = JSON.stringify(jsonObj);
		let fs = require('fs');
		fs.writeFile('./server_config.json', jsonContent, 'utf8', function(){
			res.redirect('/settings');
		});
				

  	} else {
		res.render('login',{ status:'',message:'' });
  	}
})

// ======== Maintenace Mode ============================================
app.post('/result_model', async function(req,res){
	
	if(req.session.username) {
		sresult_model = req.body.result_model;
		console.log(sresult_model)

		let result_model = req.body.result_model;
		
		// let dBody = {};
		// dBody['maintenance'] = maintenance_mode;
		
		let json = '{ "result_model":'+result_model+' }';
		let jsonObj = JSON.parse(json);
		// stringify JSON Object
		let jsonContent = JSON.stringify(jsonObj);
		let fs = require('fs');
		fs.writeFile('./result_model.json', jsonContent, 'utf8', function(){
			res.redirect('/settings');
		});
				

  	} else {
		res.render('login',{ status:'',message:'' });
  	}
})

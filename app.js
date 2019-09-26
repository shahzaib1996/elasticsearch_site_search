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


app.get('/login',function(req,res){
	res.render('login');
})


app.get('/', function(req, res){
		// res.status(200).render('index',{results:'',search_str:'', message:''});
	searchBody = {
		"size" : 1000,
	  	"query": {
	         "match_all" : {}
	       	}
		};
	search('mydocument', searchBody)
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
 
var express = require('express');
var server = require('http').Server(app);
var bodyParser = require('body-parser');
const uuidv1 = require('uuid/v1');
// example // uuidv1(); // -> '6c84fb90-12c4-11e1-840d-7b25c5ee775a' 
var router = express.Router();
var elasticsearch = require('elasticsearch');
var client = new elasticsearch.Client({
	host: 'localhost:9200'
})

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));
// router.set('view engine', 'ejs');

router.use( (req, res, next) => {
	console.log(req.method, req.url);
	next();
} )

router.get( '/workouts', (req, res) =>{
	return res.status(200).send({
		message: "Get workouts call",
		workouts: workouts
	})
} )


router.post( '/workout', function(req, res) {
	console.log(req.body);

	client.index({
		index: 'mydocument',
		type: 'mytype',
		id: uuidv1(),
		body: req.body
	}, function(err) {
		if( err ) {
			console.log(err);
		} else {
			return res.status(200).send({
				message: "success"
			})
		}
	});


} )


const search = function search(index, body) {
  return client.search({index: index, body: body});
};

router.get('/start', function(req, res){
		res.status(200).render('index');
})

router.get('/general_search',function(req, res){

	// var arr_str = split(" ");

	res.send(req.body.search+" --- ");	


	  let body = {
	    size: 20,
	    from: 0,
	    query: {
	      match_all: {  } 
	    }

	  };

	  // res.send(body);
	  // res.status(200).render('index');

	  // search('mydocument', body)
	  // .then(results => {
	  //   console.log(`found ${results.hits.total} items in ${results.took}ms`);
	  //   console.log(`returned article titles:`);
	  //   console.log(results);
	  //   res.send(results);
	  //   // results.hits.hits.forEach(
	  //   //   (hit, index) => console.log(
	  //   //     `\t${body.from + ++index} - ${hit._source.id}`
	  //   //   )
	  //   // )
	  // })
	  // .catch(console.error);
	

})


router.get('/search',function(req, res){

	// const test = function test() {
	  let body = {
	    size: 20,
	    from: 0,
	   //  query: {
	   //    // match_all: {  }
	      
	   //    "multi_match" : {
    //         "query" : "-oo-pppd",
    //         "fields" : ["d1"]
    //     	}

    // //    		"bool":{
    // //   "should": [
    // //     {
    // //       "match_phrase": "-oo-pppd"
    // //     }
    // //     ]
    // // }
	   //  }

	   //start
	     "query" : {
    "bool" : {
      "must" : [
        {
          "wildcard" : {
            "d1.keyword" : {
              "wildcard" : "*ssss-wwww-ssdd-oo-pppd*",
              "boost" : 1.0
            }
          }
        },
        {
          "wildcard" : {
            "d2.keyword" : {
              "wildcard" : "*ii-wwww-ssss-dddd-tttt*",
              "boost" : 1.0
            }
          }
        },
        {
          "wildcard" : {
            "d3.keyword" : {
              "wildcard" : "*cccc-yyyyy-wwww-bbbb*",
              "boost" : 1.0
            }
          }
        },
        {
          "wildcard" : {
            "d4.keyword" : {
              "wildcard" : "*lll-rrrrr-wwwww-xxxx*",
              "boost" : 1.0
            }
          }
        },
        {
          "wildcard" : {
            "d5.keyword" : {
              "wildcard" : "*bbbb-qqqq-rrrr-eee-ssss*",
              "boost" : 1.0
            }
          }
        },
        {
          "wildcard" : {
            "d6.keyword" : {
              "wildcard" : "*ffff-hhhhh-wwww-tttt-ggyy*",
              "boost" : 1.0
            }
          }
        },
        {
          "wildcard" : {
            "d7.keyword" : {
              "wildcard" : "*ssss-bbbb-hhhh-wwww-qqqqq*",
              "boost" : 1.0
            }
          }
        }
      ],
      "adjust_pure_negative" : true,
      "boost" : 1.0
    }
  },
  "_source" : {
    "includes" : [
      "d1",
      "d2",
      "d3",
      "d4",
      "d5",
      "d6",
      "d7",
      "d8"
    ],
    "excludes" : [ ]
  },
  "sort" : [
    {
      "_doc" : {
        "order" : "asc"
      }
    }
  ]
	   //end

	  };

	  search('mydocument', body)
	  .then(results => {
	    console.log(`found ${results.hits.total} items in ${results.took}ms`);
	    console.log(`returned article titles:`);
	    console.log(results);
	    res.send(results);
	    // results.hits.hits.forEach(
	    //   (hit, index) => console.log(
	    //     `\t${body.from + ++index} - ${hit._source.id}`
	    //   )
	    // )
	  })
	  .catch(console.error);
	// };

})



// module.exports = router; 
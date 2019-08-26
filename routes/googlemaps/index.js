'use strict'

var _ = require('lodash');
var express = require('express');
var db = require('../db');
var loki = require('lokijs'); //originally used for testing
var router = express.Router();
var superrouter = express.Router();
var path = require('path');
var supradir = '';

function getExtDir(depth, cd) {
    if (depth <= 0) {
        //console.log(cd);
        supradir = cd;
        return
    } else {
        let newcd = path.dirname(cd);
        //console.log(newcd);
        getExtDir(depth - 1, newcd);

    }
    return supradir
}
//console.log(getExtDir(3, __dirname));
console.log('my assigned domain (googlemaps):', process.env.PROJECT_DOMAIN);

//https://stackoverflow.com/questions/31898244/do-node-js-object-instantiaton-create-one-object-per-user
//https://erichonorez.wordpress.com/2013/02/10/how-create-a-rest-api-with-node-js-and-express/
//https://stackoverflow.com/questions/40491222/send-response-and-continue-to-perform-tasks-express-node-js

const utilities = {
    apis: {
        googlemaps: {

            searchFunc: (prms) => {
              /*
              this function instantiate a search on Google Maps based on the current values for THAT user in THAT group
              as found in the database
              */

                //https://developers.google.com/maps/documentation/javascript/examples/place-search-pagination
                //A constructor would be better here
                const configGoogleMaps = process.env.GOOGLEMAPSAPIKEY;
                let googleMapsClient = require('@google/maps').createClient({
                    key: configGoogleMaps,
                    Promise: Promise
                })
                
                //prms.pagetoken = pgtkn;
                //console.log(googleMapsClient, configGoogleMaps);
                  let paramqs = {
                      query: prms.queries[prms.querycontrol],
                      location: prms.location,
                      type: prms.type,
                      radius: prms.radius,
                      region: prms.region
                  };
                //console.error('prms.pagetoken', prms.pagetoken === 'null');
                if(prms.pagetoken !== 'null'){
                   paramqs.pagetoken = prms.pagetoken;
                }

                
                let response = googleMapsClient.places(paramqs).asPromise();
              
                return response

            },
            exposeData: (groupid, user, users, res) => {
                /*
                this function is the actual search on Google Maps
                - takes the current parameter values from database and instantiate a search with them (@apiresponse)
                - @apiresponse is a promise
                - if OK
                ---- get only those places from the search that haven't been reported (filter)
                ---- if there is no places after filtering, check is there is no more places to try (@querycontrol)
                ---- if so, update the database with new parameters for a next search and re-call this function (exposeData)
                ---- otherwise, close
                - if ERROR
                ---- if INVALID REQUEST, it is possible that there is a timeout issue: try a search again with current parameter values (not ideal action)
                ---- otherwise, 500
                
                */
                //console.error('in promise search', user.groupids[groupid])
                let prms = user.groupids[groupid].searchParamsDB;
                let apiresponse = utilities.apis.googlemaps.searchFunc(prms);
                console.error(apiresponse);

                apiresponse
                    .then((d) => {
                        if (d.json.status === "OK") {
                            console.log('inside apiresponse');
                            let newplaceslist = d.json.results.map((place) => {
                                    return {
                                        source: "Google",
                                        name: place.name,
                                        id: place.place_id,
                                        query: prms.queries[prms.querycontrol],
                                        address: place.formatted_address,
                                        status: 'OPEN'
                                    }
                                })
                                .filter((newpl) => {
                                    return prms.placeids.indexOf(newpl.id) === -1;
                                });
                            if (newplaceslist.length === 0) {
                                //UPDATE QUERYCONTROL VALUE
                                let qc = prms.querycontrol + 1;
                                //SEE IF THERE IS ANOTHER QUERY TO EXPLORE
                                if (qc < prms.queries.length) {
                                    //UPDATE DATABASE
                                    user.groupids[groupid].searchParamsDB.querycontrol = qc;
                                    user.groupids[groupid].searchParamsDB.pagetoken = "null";
                                    //users.update(user); // THIS ONE has to be substituted by firebase logic
                                    db.dbfirebase
                                      .ref('/Users/'+user.userid+'/groupids/'+groupid+'/searchParamsDB/')
                                      .update(user.groupids[groupid].searchParamsDB);
                                    console.log("NO RECORDS; CHECKING THE NEXT QUERY");
                                    prms = user.groupids[groupid].searchParamsDB;
                                    this.exposeData(prms);
                                    
                                } else {
                                    //UPDATE DATABASE
                                    user.groupids[groupid].searchParamsDB.querycontrol = 0;
                                    user.groupids[groupid].searchParamsDB.pagetoken = "null";
                                    user.groupids[groupid].searchParamsDB.stopSearch = true; //change to global
                                    //users.update(myUser); // THIS ONE has to be substituted by firebase logic
                                    db.dbfirebase
                                      .ref('/Users/'+user.userid+'/groupids/'+groupid+'/searchParamsDB/')
                                      .update(user.groupids[groupid].searchParamsDB);                                    
                                    console.log("NO RECORDS AND NO MORE QUERIES TO LOOK FOR");
                                    res.status(200).send([{ status: 'CLOSED' }]);
                                };
                            } else {
                                //UPDATE DATABASE
                                user.groupids[groupid].searchParamsDB.pagetoken = d.json.next_page_token;
                                //users.update(user); // THIS ONE has to be substituted by firebase logic
                                db.dbfirebase
                                  .ref('/Users/'+user.userid+'/groupids/'+groupid+'/searchParamsDB/')
                                  .update(user.groupids[groupid].searchParamsDB);                                
                                console.log("FOUND RECORDS: SEND TO USER");
                                //console.log("new token", user.groupids[groupid].searchParamsDB.pagetoken);
                                res.status(d.status).send(newplaceslist);
                            };

                        };
                    })
                    .catch((e) => {
                        console.log(e);
                        if (e.json && e.json.status == 'INVALID_REQUEST') { //try again ALL THE TIME - should be changed!!!
                            user.groupids[groupid].searchParamsDB.pagetoken = "null";
                            //users.update(user); // THIS ONE has to be substituted by firebase logic
                            db.dbfirebase
                              .ref('/Users/'+user.userid+'/groupids/'+groupid+'/searchParamsDB/')
                              .update(user.groupids[groupid].searchParamsDB);
                            console.log("NO RECORDS; CHECKING THE NEXT QUERY");
                            prms = user.groupids[groupid].searchParamsDB;
                            this.exposeData(prms);
                        }else if(e && e.json === undefined){
                          res.status(400).send([{status:e}])
                        }else{
                         //every other case
                          res.status(500).send([{ status: 'ERROR!!!' }]);
                        };
                        
                    });
            }
        }
    }
};


const registers = { //a register for the routers
    searches: {},
    users: {},
    groups: {},
    routes: (router, route, key) => {
        /*
        a registration factory based on Udemy node.js course
        - iterate through routers object
        - if the method of a route is object, not null and not an Array, re-run the function on router and method (go deeper)
        - else, we got there: create the actual router functionalities
        */
        for (let method in route) {
            //console.log(method);
            if ((typeof route[method] === 'object') && (route[method] != null) && !(route[method] instanceof Array)) {
                //key is null and method is method
                registers.routes(router, route[method], method);
            } else {
                //if false, then routes[method] is actually a function!
                //then method is not method but path, and key is method
                //console.log(route, key);
                //let pth = method;
                let method = key;
                if (method === 'get') {
                    for (let pth in route) {
                        router.get(pth, route[pth]);
                    };
                } else if (method === 'post') {
                    for (let pth in route) {
                        //console.log(route[pth]);
                        router.post(pth, route[pth]);
                    };
                } else if (method === 'delete') {
                    for (let pth in route) {
                        //console.log(route[pth]);
                        router.delete(pth, route[pth]);
                    };
                } else {
                    //if a page is not found, register and use the NA route
                    router.use(route['NA']);
                }
            }
        }

    }
};

const middlewares = {
    /*
    @middlewares includes:
    - a simple authorization middleware that verifies if the user/group exist on the database
    - a similar as above but to check if the user is also admin
    */
    authorizationFunctionEntity: function(req, res, next) {
        console.log('in middleware authorizationFunctionEntity');
        if(req.params.userid !== undefined){
          db.dbfirebase
            .ref('/Users/'+req.params.userid)
            .once('value')
            .then(function(snshpU){
                db.dbfirebase
                  .ref('/Groups/'+req.params.groupid)
                  .once('value')
                  .then(function(snshpG){
                    //console.error(snshpG.val());
                    if(snshpG.val() !== null){ //group is created: check for ids
                      if(snshpG.val().memberids.indexOf(req.params.userid) > -1){
                        next(); //the user is registered in this group
                      }else{
                        next(new Error(`Invalid groupid ${req.params.groupid}`));
                      }
                    }else{
                      next(); //assumes is still no group created...
                    }
                   })
                  .catch(function(err){
                      next(new Error(err));
                  })
            })
            .catch(function(err){
              next(new Error('Invalid userid '+ err))
            })
           
        }
        //if (req.params.groupid !== undefined) {
        //    console.log(req.params.groupid);
        //    //console.log(db.GroupsColl);
        //    //https://firebase.google.com/docs/database/web/read-and-write
        //    //console.log();
        //    //console.log(db.GroupsColl.findObject({ groupid: req.params.groupid }));
        //    db.dbfirebase
        //      .ref('/Groups/' + req.params.groupid)
        //      .once('value')
        //      .then(function(snshp){
        //        console.log(snshp.val());
        //        if(typeof snshp.val() === 'object'){
        //          if(Object.keys(snshp.val().memberidsF).indexOf(req.params.userid) > -1){
        //            next();
        //          }else{
        //            next(new Error('Invalid userid'));
        //          };                  
        //        }else{
        //          console.error(111, snshp);
        //        };
        //      })
        //      .catch(function(err){
        //        next(new Error(`Invalid groupid ${req.params.groupid}`));
        //      });
        //}else{
        //  
        //};
        //  if (db.GroupsColl.findObject({ groupid: req.params.groupid }) !== null) {
        //        console.log(req.params.groupid);
        //        if (db.GroupsColl.findObject({ groupid: req.params.groupid })['memberids'].indexOf(req.params.userid) > -1) {
        //            //console.log(registers.groups[req.params.groupid]);
        //            //console.log(req.params.userid);
        //            next();
        //        } else {
        //            next(new Error('Invalid userid'));
        //        };
        //    } else {
        //        next(new Error(`Invalid groupid ${req.params.groupid}`));
        //    };
        //} else if ((req.params.userid !== undefined) && (db.UsersColl.findObject({ userid: req.params.userid }) !== null)) {
        //    next(); //this might also control for not generating a user that has been created by the same session!
        //} else {
        //    next(new Error('No userid found'));
        //};
    },
    authorizationFunctionGroupAdmin: function(req, res, next) {
        console.log('in middleware authorizationFunctionGroupAdmin');
        if (req.params.groupid !== undefined) {
            console.log(req.params.groupid);
            //console.log(db.GroupsColl);
            //https://firebase.google.com/docs/database/web/read-and-write
            //console.log();
            //console.log(db.GroupsColl.findObject({ groupid: req.params.groupid }));
          db.dbfirebase
            .ref('/Groups/' + req.params.groupid)
            .once('value')
            .then(function(snshp){
                if(snshp){
                  console.log(snshp.val());
                  if(snshp.val().adminid === req.params.adminid){
                    next();
                  }else{
                    next(new Error('You are not admin of this group'));
                  };                
                };
             
            })
            .catch(function(err){
              next(new Error(`Invalid groupid ${req.params.groupid}`));
            });
        };
        //let group = db.GroupsColl.findObject({ groupid: req.params.groupid });
        //if (group !== null) {
        //    if (group.adminid === req.params.adminid) {
        //        next();
        //    } else {
        //        next(new Error('you are not admin of this group'));
        //    }
        //} else {
        //    next(new Error('Invalid groupid'));
        //};
    },
};

const route_functionalities = {
    /*
    the pagination button
    all the found results from Google Maps are not shown at once - cost money -
    so to show more results the user has to ask for
    */
    rDataEntity: {
        buttonforPagination: function(userid, groupid, res) {
          db.dbfirebase
              .ref('/Users/' + userid)
              .once('value')
              .then(function(snshp){
                console.log('user in pagination', snshp.val().userid);
                let user = snshp.val();
                utilities.apis.googlemaps.exposeData(groupid, user, db.UsersColl, res);
                //if(snshp.groupids[groupid].searchParamsDB.stopSearch == false){  
                //}
              })
              .catch(function(err){
                console.error(err)               
              })
            //db.dbfirebase
            //  .ref('/Users/' + userid)
            //  .on('value',
            //    function(snshp){
            //      console.log('user in pagination', snshp.val().userid);
            //      let user = snshp.val();
            //      utilities.apis.googlemaps.exposeData(groupid, user, db.UsersColl, res);
            //      //if(snshp.groupids[groupid].searchParamsDB.stopSearch == false){  
            //      //}
            //    })
            //  .catch(function(err){
            //    console.error(err)               
            //  })
            //let user = db.UsersColl.findObject({ userid: userid });
            //console.log('user in pagination', user);
            ////if (user.groupids[groupid].searchParamsDB.stopSearch == false) {
            //utilities.apis.googlemaps.exposeData(groupid, user, db.UsersColl, res);
            ////}
        }
    }
};

//https://stackoverflow.com/questions/15408416/how-to-handle-empty-arrays-in-firebase

let routes = {
    /*
    the routes object that will go into the factory above (@registers)
    */
    'get': {
        "/user": (req, res, next) => { //create new session ALWAYS
            console.log('in router1: googlemaps');
            console.log('session', req.sessionID)
            req.params.groupid = req.params.userid;
            let userID_return = db.dbutils.initEntity;
            let pseudosessionid, selfgroupid;
            pseudosessionid, selfgroupid = userID_return(1, res, req, db.UserSchema, db.UsersColl, db.GroupSchema, db.GroupsColl);

            //res.redirect('/googlemaps/user/' + pseudosessionid + '/group/' + selfgroupid);
        },
        "/user/:userid/group/:groupid": [
            middlewares.authorizationFunctionEntity,
            (req, res, next) => {
                console.log('in router7', req.params);
                //res.render('placesgroup', {
                //    title: 'Hello Group',
                //    groupid: req.params.groupid,
                //    adminuserid: db.GroupsColl.findObject({ groupid: req.params.groupid }).adminid,
                //    sessionid: db.GroupsColl.findObject({ groupid: req.params.groupid }).memberids
                //});
                db.dbfirebase
                  .ref('/Groups/' + req.params.groupid)
                  .once('value')
                  .then(function(snshp){
                      res.render('placesgroup', {
                          title: 'Hello Group',
                          groupid: req.params.groupid,
                          adminuserid: snshp.val().adminid,
                          sessionid: snshp.val().memberids
                      });                  
                  })
                  .catch(function(err){
                   console.error(err)
                  })
                
            }
        ],

        "/user/:userid/group/:groupid/profile": [
            middlewares.authorizationFunctionEntity,
            (req, res, next) => {
                console.log('in router4 and router10 mixed', req.params.userid);
                //res.render('group', {
                //    userid: req.params.userid,
                //    groupid: req.params.groupid,
                //    yourgroups: Object.keys(db.UsersColl.findObject({ userid: req.params.userid }).groupids),
                //    yourselection: _.flatten(db.GroupsColl.findObject({ adminid: req.params.groupid })['memberids'].map((u) => { if(db.UsersColl.findObject({ userid: u }).groupids[req.params.groupid]) {return db.UsersColl.findObject({ userid: u }).groupids[req.params.groupid].choiceids} }, [])),
                //    members: db.GroupsColl.findObject({ groupid: req.params.groupid }).memberids
                //})
                db.dbfirebase
                  .ref('/Groups/' + req.params.groupid)
                  .once('value')
                  .then(function(snshpG){
                    db.dbfirebase
                      .ref('/Users/'+ req.params.userid)
                      .once('value')
                      .then(function(snshpU){
                          let us = [];
                          Object.keys(snshpG.val().memberidsF)
                                .forEach((u)=>{
                                          us.push(db.dbfirebase
                                                    .ref('/Users/'+u)
                                                    .once('value')
                                                    .then(function(sU){
                                                          let chs = sU.val()
                                                                          .groupids[req.params.groupid]
                                                                          .choiceids 
                                                          if(chs !== 'null'){
                                                            return Object.keys(chs)
                                                          }
                                                    })
                                          )
                                  });
                          console.error(us);
                          Promise.all(
                                      us
                                     )
                                    .then(function(values){
                                      console.error('values',values);
                                      res.render('group', {
                                          userid: req.params.userid,
                                          groupid: req.params.groupid,
                                          yourgroups: Object.keys(snshpU.val().groupids),
                                          yourselection: _.flatten(values).filter((e)=> {return e !== undefined}),
                                          members: Object.keys(snshpG.val().memberidsF)
                                      });
                                    })
                      //Object.keys(snshpG.val().memberidsF)
                      //                              .map((u) => {
                      //                                    //console.error('u',u);
                      //                                    db.dbfirebase
                      //                                      .ref('/Users/'+u)
                      //                                      .once('value')
                      //                                      .then(function(sU){
                      //                                          console.error(sU.val().groupids[req.params.groupid].choiceids);
                      //                                          return Object.keys(sU.val().groupids[req.params.groupid].choiceids);
                      //                                          //if(Object.keys(sU.val().groupids).indexOf(req.params.groupid) > -1){
                      //                                          //  if(sU.val().groupids[req.params.groupid].choices){
                      //                                          //     return sU.val().groupids[req.params.groupid].choices; 
                      //                                          //  };                                                                
                      //                                          //}
                      //                                      });
                      //                                    })
                          //res.render('group', {
                          //    userid: req.params.userid,
                          //    groupid: req.params.groupid,
                          //    yourgroups: Object.keys(snshpU.val().groupids),
                          //    yourselection: _.flatten(Object.keys(snshpG.val().memberidsF)
                          //                          .map((u) => {
                          //                                //console.error('u',u);
                          //                                db.dbfirebase
                          //                                  .ref('/Users/'+u)
                          //                                  .once('value')
                          //                                  .then(function(sU){
                          //                                      console.error(sU.val().groupids[req.params.groupid].choiceids);
                          //                                      return Object.keys(sU.val().groupids[req.params.groupid].choiceids);
                          //                                      //if(Object.keys(sU.val().groupids).indexOf(req.params.groupid) > -1){
                          //                                      //  if(sU.val().groupids[req.params.groupid].choices){
                          //                                      //     return sU.val().groupids[req.params.groupid].choices; 
                          //                                      //  };                                                                
                          //                                      //}
                          //                                  });
                          //                              }, [])
                          //                      ),
                          //    members: Object.keys(snshpG.val().memberidsF)
                          //})                          
                      })
                      .catch(function(err){
                        console.error(err)
                      })
                  })
                  .catch(function(err){
                   console.error(err)
                  })
            }
        ],
        "/user/:userid/group/:groupid/data-apis": [
            middlewares.authorizationFunctionEntity,
            (req, res, next) => {
                console.log('in data-apis', req.params);
                route_functionalities.rDataEntity.buttonforPagination(req.params.userid, req.params.groupid, res);
            }
        ]
    },
    'post': {
        "/user/:userid/group/:groupid/choice": [
            middlewares.authorizationFunctionEntity,
            (req, res, next) => {
                console.log('in router3', req.body);
                db.dbutils.addChoice(req, db.UsersColl);
            }
        ],
        "/user/:userid/group": [
            middlewares.authorizationFunctionEntity,
            (req, res, next) => {
                console.log('in router6', req.params.userid);
                let userID_return = db.dbutils.initEntity;
                let pseudosessionid;
                let selfgroupid;
                pseudosessionid, selfgroupid = userID_return(1, res, req, db.UserSchema, db.UsersColl, db.GroupSchema, db.GroupsColl);
                //res.redirect('/googlemaps/user/' + req.params.userid + '/group/' + newgroupid);
            }
        ],
        "/user/:adminid/group/:groupid/member": [
            middlewares.authorizationFunctionGroupAdmin,
            (req, res, next) => {
                console.log('in router8', req.params, req.body);
                db.dbutils.addMember(req, res);

            }
        ],
        "/user/:adminid/group/:groupid/admin": [
            middlewares.authorizationFunctionGroupAdmin,
            (req, res, next) => {
                console.log('in addAdmin', req.params, req.body);
                //db.dbutils.addMember(req, res);

            }
        ],

    },
    'delete': {
        "/user/:userid/group/:groupid/choice": [
            middlewares.authorizationFunctionEntity,
            (req, res, next) => {
                console.log('in delete choice', req.body);
                res.status(200).end();
            }
        ],
        "/user/:adminid/group/:groupid/member": [
            middlewares.authorizationFunctionGroupAdmin,
            (req, res, next) => {
                if (req.body.name !== req.params.adminid) {
                    console.log('in delete member', req.body);
                } else {
                    console.log('do you want to delete this group?')
                };

                res.status(200).end();
            }
        ],
    },
    'NA': (req, res, next) => res.status(400).send("STATUS 400: PAGE NOT FOUND"),

};



//const superrouter = registers.routes(router, routes);
registers.routes(router, routes);
module.exports = { router };
/*
IMPORTANT!!: this part of the project is STILL a transition from using a test static database (lokiJS) to firebase
there are still some unsolved issues until the transition is completed
*/

var admin = require("firebase-admin");
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

const frbServiceAccount = {
  "type": process.env.FBASTYPE,
  "project_id": process.env.FBASPROJECTID,
  "private_key_id": process.env.FBASPRIVKEYID,
  //https://stackoverflow.com/questions/50299329/node-js-firebase-service-account-private-key-wont-parse
  "private_key": process.env.FBASPRIVKEY.replace(/\\n/g, '\n'),
  "client_email": process.env.FBASCLIENTEMAIL,
  "client_id": process.env.FBASCLIENTID,
  "auth_uri": process.env.FBASAUTHURI,
  "token_uri": process.env.FBASTOKENURI,
  "auth_provider_x509_cert_url": process.env.FBASAUTHPROV,
  "client_x509_cert_url": process.env.FBASCLIENTCERT
}

//console.error(frbServiceAccount.private_key);

admin.initializeApp({
    credential: admin.credential.cert(frbServiceAccount),
    databaseURL: "https://amsecol-218722.firebaseio.com"
});

var dbfirebase = admin.database();


const loki = require('lokijs'); // used during the build-up, for testing purposes
const db = new loki('Example');

const UsersColl = db.addCollection('users');
const GroupsColl = db.addCollection('groups');

//MODELS
//https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes
//--- Collection Users
class UserSchema {
    /*
        userid,
        name,
        created,
        lastmodified,
        choiceids,
        groupids,
        favoriteschoiceids   
    */
    constructor(userid) {
        this.userid = userid;
        this.username = '';
        this.choiceids = [];
        this.groupids = {};
        //this.groupids = {};
        this.favoritechoiceids = [];
        this.usersessionUUID = null;
        this.created = '';
        this.lastmodified = '';
    }

    static mydate() {
        return "created_date"
    }

    static details() {
        return {
            userid,
            username,
            usersessionUUID,
            choiceids,
            groupids,
            favoritechoiceids,
            created: mydate(),
            lastmodified
        }
    }
};

//--- Collection Groups
class GroupSchema {

    constructor(groupid) {
        this.groupid = groupid;
        this.groupname = '';
        this.adminid = null;
        this.memberids = [];
        this.created = '';
        this.lastmodified = '';
        this.groupsessionUUID = null;
    }

    static mydate() {
        return "created_date"
    }

    static details() {
        return {
            groupid,
            adminid,
            memberids,
            groupname,
            groupsessionUUID,
            created: mydate(),
            lastmodified
        }
    }
};

//--- Collection Choices
var Choice = function() {
    return {
        choiceid,
        userids,
        lasttimeselected,
        favoritescount
    }
};

//--- Collection Groups
var Group = function() {
    return {
        groupid,
        adminuserid,
        membersuserid,
        groupname,
        created,
        lastmodified,
        choicedis,
        votes
    }
};


var privatefunctions = {
    create_UUID: function() {
        var dt = new Date().getTime();
        var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = (dt + Math.random() * 16) % 16 | 0;
            dt = Math.floor(dt / 16);
            return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
        return uuid;
    }
};

//https://hackernoon.com/node8s-util-promisify-is-so-freakin-awesome-1d90c184bf44/
//https://medium.com/trabe/understanding-nodes-promisify-and-callbackify-d2b04efde0e0
//https://developers.google.com/web/fundamentals/primers/promises
//https://blog.grossman.io/how-to-write-async-await-without-try-catch-blocks-in-javascript/




var dbutils = {
    //TODO: include the initialization of an AGENT
    //      include RESTs for agents (should be VERY like users)
    //      involve some clever tools to relate agents to normal users, like forking / merging
    //      include profiling of agents (should be like users, but public)

    initEntity: (r, res, prms, UserSchema, UsersColl, GroupSchema, GroupsColl) => { //init user AND group
        
      /*
      this is a very simple sketch for user and group creation, parametrization of variables and updating, all in one
      notice that it is not ACID, it is not in parallel and no verification of transactions is made
      it is just a quick example
      */
      
      var uid = prms.params.userid;
        
        //the following conditional is: if user doesnt have an id, create a new user and group (both same id)
        //the initial group will be instatiated with search parameters but NO other members than the creator (exclusive)  
      if (uid === undefined) {
            //assume is first time!
            uid = privatefunctions.create_UUID();
            const newuserd = new UserSchema(uid);
            let megid = uid;
            newuserd.groupids = {}
            newuserd.groupids[megid] = { //init parameters of a search; hard coded
                searchParamsDB: {
                    queries: ["vegan", "vegetarian", "organic cafes", "organic restaurants"],
                    querycontrol: 0,
                    location: [52.370216, 4.895168],
                    type: "restaurant",
                    radius: 1000,
                    region: "Amsterdam",
                    pagetoken: 'null',
                    placeids: 'null'
                    //stopSearch:false
                },
                choiceids: 'null'
            };
            let megroupd = new GroupSchema(megid); //instance of the a Group
            megroupd.adminid = uid;                //administrator of the group is the creator (uid == id of current user)
            if (prms.groupname == undefined) {
                megroupd.groupname = 'me';
            } else {
                megroupd.groupname = prms.groupname; //this is first of what it will be A LOT OF EXCEPTIONS to control
            }
            megroupd.memberidsF = {}; //the F is for a temporary hack to indicate something on my firebase database to falicitate search...
            megroupd.memberidsF[uid] = 1;
            megroupd.memberids = [uid];
            dbfirebase.ref('/Users/' + uid).set(newuserd); // creating an entry in firebase based on assigned id, not automatic key
            dbfirebase.ref('/Groups/' + megid).set(megroupd);
            let sPDB = UsersColl.insert(newuserd);
            let sPDBgroup = GroupsColl.insert(megroupd);
            prms.params.groupid = megid;
        }
        
        //a group exists!
        var gid = prms.params.groupid;

        //if a group exists and it is different to intial group, create a new one and instantiate search and members
        if ((gid !== undefined) && (gid !== uid)) {
            dbfirebase.ref('/Users/' + uid + '/groupids/' + gid)
                .once("value")
                .then(function(usersnapshot) {
                    //console.log(usersnapshot.val());
                    // dbfirebase.ref('/Groups/' + gid).on("value", function(groupsnapshot) {
                    //     console.log(groupsnapshot.val())
                    // })
                    if (usersnapshot.val() === null) {
                        let newgroupuserparams = {
                            searchParamsDB: {
                                queries: ["vegan", "vegetarian", "organic cafes", "organic restaurants"],
                                querycontrol: 0,
                                location: [52.370216, 4.895168],
                                type: "restaurant",
                                radius: 1000,
                                region: "Amsterdam",
                                pagetoken: 'null',
                                placeids: 'null',
                                stopSearch:false
                            },
                            choiceids: 'null'
                        };
                        dbfirebase.ref('/Groups/' + gid + '/memberidsF/' + uid)
                            .once("value")
                            .then(function(newmember) {
                                //console.log(groupsnapshot.val())
                                if (newmember.val() === null) {
                                    dbfirebase.ref('/Users/' + uid + '/groupids/' + gid).set(newgroupuserparams); // under sPDB... newuserd gets new lokiJS properties!!
                                    let nm = {};
                                    nm[uid] = 1;
                                    dbfirebase.ref('/Groups/' + gid + '/memberidsF/').update(nm);
                                }
                                // let lst = [];
                                // groupsnapshot.val().forEach((x) => { lst.push(x) });
                                // if (lst.indexOf(uid) === -1) {
                                //     lst.push(uid);
                                //     let newmembers = {};
                                //     for (let i = 0; i < lst.length; i++) {
                                //         newmembers[Number(i)] = lst[i];
                                //     };

                                //}
                            })
                    } else {

                    }
                })
        // it is a non-existing group...
        } else if (gid === undefined) {
            if (gid !== uid) gid = privatefunctions.create_UUID();
            let newgroupd = new GroupSchema(gid);
            newgroupd.adminid = uid;
            if (prms.groupname == undefined) {
                newgroupd.groupname = '';
            } else {
                newgroupd.groupname = prms.groupname; //this is first of what it will be A LOT OF EXCEPTIONS to control
            }
            newgroupd.memberidsF = {};
            newgroupd.memberidsF[uid] = 1;
            newgroupd.memberids = [uid];
            dbfirebase.ref('/Groups/' + gid).set(newgroupd);
            dbfirebase.ref('/Users/' + uid + '/groupids/' + gid).set({
                searchParamsDB: {
                    queries: ["vegan", "vegetarian", "organic cafes", "organic restaurants"],
                    querycontrol: 0,
                    location: [52.370216, 4.895168],
                    type: "restaurant",
                    radius: 1000,
                    region: "Amsterdam",
                    pagetoken: 'null',
                    placeids: 'null',
                    stopSearch:false
                },
                choiceids: 'null'
            });
            let sPDBgroup = GroupsColl.insert(newgroupd);
        };



        //this is likely a redundancy I have to work on...        
        function initSearch(uid, gid, user, group) {
            user.groupids = {}
            user.groupids[gid] = { searchParamsDB: undefined, choiceids: undefined };

            user.groupids[gid].searchParamsDB = {
                queries: ["vegan", "vegetarian", "organic cafes", "organic restaurants"],
                querycontrol: 0,
                location: [52.370216, 4.895168],
                type: "restaurant",
                radius: 1000,
                region: "Amsterdam",
                pagetoken: null,
                placeids: [],
                stopSearch:false
            };
            user.groupids[gid].choiceids = [];
            //if (Object.keys(user.groupids).indexOf(gid) === -1) {
            //    group.memberids.push(uid);
            //};
            if (group.memberids.indexOf(uid) === -1) {
                group.memberids.push(uid);
                console.log('inserting into group', uid, gid, group.memberids);
                console.log('groups created', Object.keys(user.groupids));
            }


            return user, group
        }

        ////users and groups have been already created: find them
        //var user = UsersColl.findObject({ userid: uid });
        //var group = GroupsColl.findObject({ groupid: gid });


        ////take the corresponding parameters to initialize the search and pass it to user, group
        //user,
        //group = initSearch(uid, gid, user, group);
        
        ////check current status of search activity and update (for user and for group)     
        //let sPDB = UsersColl.update(user);
        //let sPDBgroup = GroupsColl.update(group);

        console.log('ids', uid, gid);
        if (r !== null) {
            res.redirect('/googlemaps/user/' + uid + '/group/' + gid);
            //return uid, gid
        } else {
            res.status(200).end();
        }

    },
    addChoice: (req, UsersColl) => {
        /*
        this part deals with adding choices
        again, no ACID but likely less problematic than above
        */
        const uid = req.params.userid;
        const gid = req.params.groupid;
        const newchoice = req.body.choice;

        dbfirebase.ref('/Users/' + uid + '/groupids/' + gid + '/choiceids/')
            .once("value")
            .then(function(usersnapshot) {
                if (usersnapshot.val() === 'null') {
                    let nc = {};
                    nc[newchoice] = 1;
                    dbfirebase.ref('/Users/' + uid + '/groupids/' + gid + '/choiceids/').set(nc);
                } else {
                    dbfirebase.ref('/Users/' + uid + '/groupids/' + gid + '/choiceids/' + newchoice)
                        .once("value")
                        .then((choicesnapshot) => {
                            if (choicesnapshot.val() === null) {
                                let nc = {};
                                nc[newchoice] = 1;
                                dbfirebase.ref('/Users/' + uid + '/groupids/' + gid + '/choiceids/').update(nc);
                            }
                        })
                }
            })


        const user = UsersColl.findObject({ userid: req.params.userid });
        user.groupids[req.params.groupid].choiceids.push(req.body.choice);
        UsersColl.update(user);

    },
    deleteChoice: (req, UsersColl) => {
        /*
        deleting a choice; if I am not wrong, every member could delete a choice
        choices are added to the group and updated in the user who made the choice
        */      
        console.log('in deleteChoice', req.body.choice);
        var user = GroupsColl.findObject({ userid: req.params.userid });
        user.groupids[req.params.groupid].choiceids.slice(user.groupids[req.params.groupid].choiceids.indexOf(req.body.choice), 1);
        UsersColl.update(user);
    },
    addMember: (req, res) => {
         /*
        adding a member
        it initiates a group capability for a search and choice to the added member
        */ 
        console.log('in addMember', req.body.memberid);
        req.params.userid = req.body.memberid; //!!!
        dbutils.initEntity(null, res, req, UserSchema, UsersColl, GroupSchema, GroupsColl);
    },
    deleteMember: (req, GroupColl) => {
         /*
        deleting a member
        it deletes the member in the group so it doesn't have access to the group activity, but keeps the information about member's choices
        */ 
        console.log('in deleteMember', req.body.memberid);
        req.params.userid = req.body.memberid; //!!!
        var uid = prms.params.userid;
        var group = GroupsColl.findObject({ groupid: req.params.groupid });
        group.memberids.slice(group.memberids.indexOf(uid), 1);
        GroupsColl.update(group);
    },
    addAdmin: (req, GroupsColl) => {
       /*
       assigns admin to the group
       */
        console.log('in addAdmin', req.body.memberid);
        var uid = prms.params.userid;
        var group = GroupsColl.findObject({ groupid: req.params.groupid });
        //group.memberids.slice(group.memberids.indexOf(uid), 1);
        //GroupsColl.update(group);     
    },
    deleteGroup: (req, GroupsColl) => {
        /*
        TODO
        */
        console.log('in deleteGroup', req.body.group);
        var gid = req.params.groupid;
        var group = GroupsColl.findObject({ groupid: gid });
        //Equal as deleteMember but my userid
        //Include a deletion of ADMIN if there are more than one
    },
    deleteUser: () => {
       /*
       TODO
       */ 
      //1. delete all memberships in the group collection for all groups that are not mine FIRST
        //2. After deleting memberships, delete user at user
    },
    mergeGroups: () => {
      /*
      TODO
      */  
      //optional - how important and useful for my project?
        //think about forking!!!
        //based on current db model, merging two groups in conditions where there is more than one member is HARD:
        //>would require to check who are members of both groups and who are not
        //>for those who are in both, update the data into the merged one
        //>for those who are in the first but not in the second, copy the first and rename it / update some params 
        //if to implement, try a simple approach first: only if the person is the ONLY ADMIN and USER of BOTH groups
        //1. select one of the groups that will be "merged"; can be the second (right-merge)
        //2. at group level, copy all members (not really required)
        //3. at user.groupids level, copy all choices
    }


};



module.exports = {
    db, //it was a test, using lokijs instead of firebase
    UsersColl,
    GroupsColl,
    dbutils,
    UserSchema,
    GroupSchema,
    dbfirebase
};
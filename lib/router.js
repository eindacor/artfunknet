Router.configure({
	'layoutTemplate' : "layout"
});

Router.route('/', function() {
    if (Meteor.user()){
        if (this.params.query.code) {
            Meteor.call('registerPatreon', this.params.query.code, this.params.query.state);
        }
        Router.go("/dashboard/profile");
    } else if (Meteor.loggingIn()) {
        this.render("loading");
    } else {
        this.render("Home");
    }
});

var extractRewardInfo = function(reward_object) {
    var reward_title = reward_object.attributes.title; 
    var reward_tier;

    for (var i=0; i<artwork_rarities.length; i++) {
        var rarity = artwork_rarities[i];
        if (reward_title.toLowerCase() == rarity + " tier") {
            reward_tier = rarity;
            break;
        }
    }

    return {
        'title': reward_title,
        'tier': reward_tier
    };
};

var extractPatronInfo = function(patron_object) {
    var full_name = patron_object.attributes.full_name;
    var is_email_verified = patron_object.attributes.is_email_verified;
    var email_address = patron_object.attributes.email;

    return {
        'full_name': full_name,
        'is_email_verified': is_email_verified,
        'email_address': email_address
    }
};

Router.route('/patreon_hooks', { where: "server" }).post( function() {
    var request_body = this.request.body;
    var secret = "4aP5-OW_8hGcaaExDuQRENml1BEXV0KqHyPSTGMOSgRCwB5Xuozy6rFzCw1DrRES";

    var patreon_signature = this.request.headers["x-patreon-signature"];
    var event_type = this.request.headers["x-patreon-event"];

    this.response.statusCode = 200;
    this.response.setHeader('content-type', "application/json");

    this.response.end("success");

    var patron_id = request_body.data.relationships.patron.data.id; // "8770556"
    var reward_id = request_body.data.relationships.reward.data == null ? undefined : request_body.data.relationships.reward.data.id; // "1742939"

    var patron_data;
    var reward_data;

    for (var i=0; i<request_body.included.length; i++) {
        var included_data = request_body.included[i];
        if (included_data.id == patron_id) {
            patron_data = extractPatronInfo(included_data);
        }
    }

    var user = Meteor.users.findOne({'username': patron_data.email_address});

    var player_interface;
    if (user) {
        player_interface = new PlayerIF(user);
    }
    else return;
    
    // pledges account for creations and updates
    if (event_type == "pledges:create" || event_type == "pledges:update") {
        for (var i=0; i<request_body.included.length; i++) {
            var included_data = request_body.included[i];
            if (reward_id && included_data.id == reward_id) {
                reward_data = extractRewardInfo(included_data);
            }
        }

        var old_tier = player_interface.getPatreonTier();
        var new_tier = reward_data.tier;

        if (new_tier) {
            var icon = 'fa-thumbs-up';
            var sentiment = "good";
            // new pledge/pledge not yet thanked
            if (!player_interface.getUserObject().profile.patreon_data || !player_interface.getUserObject().profile.patreon_data.thanked) {              
                var html = '<p>You have successfully linked your account to the official <a href="https://www.patreon.com/artfunkel" target="blank"><span class="af-color">Artfunkel</span> Patreon page</a> (<span class="' + new_tier + '">' + new_tier + '</span> tier). Thank you for your support!</p>';
                player_interface.htmlAlert(html, icon, sentiment);
            }
            // changed tiers
            else if (new_tier != old_tier) {
                var html = '<p>You have successfully updated your Patreon reward level to the <span class="' + new_tier + '">' + new_tier + '</span> tier. Thank you for your support!</p>'
                player_interface.htmlAlert(html, icon, sentiment);
            }
        }  

        Meteor.users.update({'username': patron_data.email_address}, {$set: {"profile.patreon_data": {
            'patron_data': patron_data,
            'reward_data': reward_data,
            'thanked': new_tier != undefined
        }}})

        
        /* in included
            [0] -> patron
            [1] -> reward
            [2] -> campaign
            [3] -> creator
            [4] -> "everyone" reward, id: -1
            [5] -> "patrons only" reward, id: 0
            [6] - [9] -> rewards
            [10] -> goal
        */       
    }
    else if (event_type == "pledges:delete") {
        Meteor.users.update({'username': patron_data.email_address}, {$set: {"profile.patreon_data": {
            'patron_data': patron_data,
            'reward_data': undefined,
            'thanked': false
        }}})
    }
});

Router.route('/dashboard/:section', function() {
    if (Meteor.user()) {
        this.render("dashboard", {
            data: {
                'specified_section': this.params.section
            }
        });
    }

    else {
        Router.go("login");
    }
})

Router.route('galleries', function() {
    if (Meteor.user())
        this.render("galleries");

    else Router.go("login");
})

Router.route('wiki', function() {
    this.render("wiki");
})

Router.route('leaderboard', function() {
    if (Meteor.user())
        this.render("leaderboard");

    else Router.go("login");
})

Router.route('quests', function() {
    if (Meteor.user())
        this.render("quests");

    else Router.go("login");
})

Router.route('admin', function() {
    if (Meteor.user())
        this.render("adminTools");

    else Router.go("login");
})

Router.route( 'uploadArtwork', function() {
	this.render('uploadArtwork');
});

Router.route( 'adminDashboard', function() {
	this.render('adminDashboard');
});

Router.route( 'loot', function() {
	this.render('randomDrop');
});

Router.route( 'store', function() {
    this.render('store');
});

Router.route('reset', function() {
    this.render('forgotPassword');
});

Router.route('help', function() {
    this.render('help');
});

Router.route('register', function() {
	if (Meteor.user())
		Router.go("/dashboard/profile");

	else this.render("registration");
})

Router.route('logout', function() {
    Meteor.logout(function() {
        Router.go('/');
    });
});

Router.route('login', function() {
    if (Meteor.user()){
        Router.go("/dashboard/profile");
    } 

    else if (Meteor.loggingIn()) {
        this.render("loading");
    } 

    else {
        this.render("login");
    }
});

Router.route('auctions', function(){
    if (Meteor.user()){
        this.render("auctions");
    } 

    else if (Meteor.loggingIn()) {
        this.render("loading");
    } 

    else {
        Router.go("login");
    }
});

Router.route('user/:screen_name', function() {
    if (Meteor.user()) {
        this.render("userGallery", {
            data: {
                'screen_name': this.params.screen_name,
                'own_gallery': this.params.screen_name == Meteor.user().profile.screen_name
            }
        });
    }
});

Router.route('/3d', function() {
    this.render("3d");
});
Router.configure({
	'layoutTemplate' : "layout"
});

Router.route('/', function() {
    if (Meteor.user()){
        Router.go("/dashboard/profile");
    } else if (Meteor.loggingIn()) {
        this.render("loading");
    } else {
        this.render("Home");
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
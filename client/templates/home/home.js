var window_size_tracker = new Tracker.Dependency;
var background_tracker = new Tracker.Dependency;
var image_width = undefined;
var image_height = undefined;
var margin_top = undefined;
var margin_left = undefined;
var selected_artwork = undefined;

var setBackground = function() {
	var query;
	var excluded_works = ['Saturn Divouring His Son', 'Vitruvian Man', 'Interior'];
	if (selected_artwork) 
		query = {'title': {"$nin": excluded_works}, 'filename': {"$ne": selected_artwork.filename}, 'rarity': {"$in": ['legendary', 'masterpiece']}};

	else query = {'title': {"$nin": excluded_works}, 'rarity': {"$in": ['legendary', 'masterpiece']}};

	var random_index = Math.floor(Math.random() * artworks.find(query).count());

	selected_artwork = artworks.findOne(query, {skip: random_index});

	background_tracker.changed();
	
	resizeBackground();
}

var resizeBackground = function() {
	if (selected_artwork) {
		var screen_ratio = window.innerWidth / window.innerHeight;
		var image_ratio = selected_artwork.width / selected_artwork.height;
		var img_scale;

		if (screen_ratio > image_ratio) {
			image_width = "100%";
			image_height = undefined;
			img_scale = window.innerWidth / selected_artwork.width;
			margin_top = Math.floor((selected_artwork.height * img_scale * -.5) + (window.innerHeight * .5)) + "px";
			margin_left = undefined;
		}

		else {
			image_width = undefined;
			image_height = "100%";
			img_scale = window.innerHeight / selected_artwork.height;
			margin_left = Math.floor((selected_artwork.width * img_scale * -.5) + (window.innerWidth * .5)) + "px";
			margin_top = undefined;
		}

		window_size_tracker.changed();
	}
}

var loginNewUser = function(user_object) {
    Meteor.loginWithPassword(user_object.email, user_object.password, function(login_error) {
        if (!login_error)
            Router.go('/');

        else console.log("error logging in newly created user: " + login_error);
    });
}

var validateCreateLogin = function(user_object, beta_key, confirmed_password) {
    //this method returns an array of errors encountered
    Meteor.call('validateCreateLogin', user_object, beta_key, confirmed_password, function(error, returned_errors) {
        if (error) {
            console.log(error);
        }

        else if (returned_errors.length) {
            Session.set('registrationErrors', returned_errors);
            $('#errors').show();
            Session.set('registrationMessages', []);
            $('#messages').hide();
        }

        else {
            Session.set('registrationErrors', []);
            $('#errors').hide();  
            Session.set('registrationMessages', []);
            $('#messages').hide();
            loginNewUser(user_object); 
        }
    });
}

Template.home.helpers({
	'jumbotron_image': function() {
		window_size_tracker.depend();

		if (selected_artwork) {
			return {
				'filename': selected_artwork.filename,
				'extension': selected_artwork.file_extension,
				'width': image_width,
				'height': image_height,
				'margin_top': margin_top,
				'margin_left': margin_left
			};
		}
	},

	'work_title': function() {
		background_tracker.depend();
		if (selected_artwork)
			return selected_artwork.title;
	},

	'work_artist': function() {
		background_tracker.depend();
		if (selected_artwork)
			return selected_artwork.artist;
	},

	'error' : function() {
        var errors = Session.get('registrationErrors');
        return errors;
    },

    'message': function() {
    	return Session.get('registrationMessages');
    }
})

Template.home.events({
    'click button#login': function(event, template) {
        event.preventDefault();
        $(event.target).blur();

        var email = template.find('#login-email').value.toLowerCase();
        var password = template.find('#login-password').value;

        Meteor.loginWithPassword(email, password, function(error){
            if(error){
                alert('Login attempt failed. Please try again.');
            }
        });  
    },

    'click #register-button' : function(event, template) {
        event.preventDefault();

        var user_object = {
            "username": template.find('#email').value,
            "email": template.find('#email').value.toLowerCase(),
            "password": template.find('#password').value,
            "profile": {
                "screen_name": template.find('#screen_name').value,
                'user_type': "player"
            }
        };

        validateCreateLogin(user_object, template.find('#beta-key').value, template.find('#rtpassword').value);
    },

    'click #register-link': function() {
    	$('#login-area').hide();
    	$('#register-area').show();
    },

    'click #login-link': function() {
    	$('#register-area').hide();
    	$('#login-area').show();
    },

    'click #beta-request': function(event, template) {
    	event.preventDefault();
    	var email_address = template.find('#email').value.toLowerCase();
    	Meteor.call('requestBetaKey', email_address, function(error, response) {
	        if (error) {
	            console.log(error);
	        }

	        var messages = [];
	        
	        if (response.error_message != undefined) {	
	        	messages.push(response.error_message);
	            Session.set('registrationMessages', []);
	            Session.set('registrationErrors', messages);
	            $('#errors').show();
	            $('#messages').hide();
	        }
	        else {
	        	messages.push(response.message);
	            Session.set('registrationMessages', messages);
	            Session.set('registrationErrors', []);
	            $('#errors').hide();   
	            $('#messages').show();  	
	        }   
    	});
    }
});

Template.home.created = function() {
	this.handle = Meteor.setInterval((function() {
		setBackground();
	}), 15000);
}

Template.home.rendered = function() {
	$('#errors').hide();
	$('#register-area').hide();
	Meteor.setTimeout(function() {setBackground();}, 1000);

	window.onresize = function() {resizeBackground()};
}

Template.auctionTable.destroyed = function() {
	Meteor.clearInterval(this.handle);
}
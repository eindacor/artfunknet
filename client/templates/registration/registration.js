var loginNewUser = function(user_object) {
    Meteor.loginWithPassword(user_object.email, user_object.password, function(login_error) {
        if (!login_error)
            Router.go('/');

        else console.log("error logging in newly created user: " + login_error.message);
    });
}

var validateCreateLogin = function(user_object, confirmed_password) {
    //this method returns an array of errors encountered
    Meteor.call('validateCreateLogin', user_object, confirmed_password, function(error, returned_errors) {
        if (error) {
            console.log(error.message);
        }

        else if (returned_errors.length) {
            console.log('errors: ' + returned_errors)
            Session.set('registrationErrors', returned_errors);
            $('#errors').show();
        }

        else {
            Session.set('registrationErrors', []);
            $('#errors').hide();  
            loginNewUser(user_object); 
        }
    });
}

Template.registration.events({
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

        validateCreateLogin(user_object, template.find('#rtpassword').value);
    }
})

Template.registration.helpers({
    'error' : function() {
        var errors = Session.get('registrationErrors');
        return errors;
    }
})

Template.registration.rendered = function() {
    $('#errors').hide();
}
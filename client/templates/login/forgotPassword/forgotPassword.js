var link_sent = false;
var link_sent_tracker = new Tracker.Dependency;

Template.forgotPassword.events({
	'click #send-reset': function(event, template) {
		var email_address = template.find('#reset-email').value.toLowerCase();

		if (link_sent == false) {
			Meteor.call("sendResetPasswordEmail", email_address, function(error, result) {
				if (error)
					console.log(error);

				else {
					link_sent = true;
					link_sent_tracker.changed();
				}
			});
		}
	}
});

Template.forgotPassword.helpers({
	'link_sent': function() {
		link_sent_tracker.depend();
		return link_sent;
	}
})

Template.forgotPassword.rendered = function () {
	link_sent = false;
}
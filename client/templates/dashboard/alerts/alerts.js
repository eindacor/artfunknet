var html_tracker = new Tracker.Dependency();

Template.alerts.helpers({
	'alert' : function() {
		return alerts.find({'user_id' : Meteor.userId()}, {sort : {'time' : -1}}).fetch();
	},

	'timestamp' : function(alert_object) {
		return getTimeString(moment(alert_object.time));
		//return "test";
	},

	'setHTML': function(html, id) {
		html_tracker.depend();
		if ($('td#' + id).length > 0) {
			if ($('td#' + id).contents().length == 0) {
				$('td#' + id).append($(html));
			}
		}
		else {
			setTimeout(function() {
				html_tracker.changed();
			}, 1000);
		}
		
	}
})

Template.alerts.rendered = function() {
	html_tracker.changed();
}

Template.alerts.events({
	'click .dismiss-alert' : function(element) {
		var alert_id = $(element.target).closest('tr').data('alert_id');
		Meteor.call('removeAlert', alert_id, function(error) {
			if (error)
				console.log(error);
		})
	},

	'click #clear-all' : function () {
		Meteor.call('clearAlerts', function(error, result) {
			if (error)
				console.log(error);
		});
	}
})

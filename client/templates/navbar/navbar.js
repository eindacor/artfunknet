var quest_tracker = new Tracker.Dependency;
var quest_statuses = {};
var notifications = {
	'loot': [],
	'xp': [],
	'money': [],
	'store': [],
	'procs': []
};
var notification_ids_rendered = [];

//get notifications
//set var
//run addnotifications
//	run for loop adding each element
//unset var
//

var getNotificationAppendString = function(notification_object, type) {
	switch (type) {
		case "procs": return '<div class="notification af-color"><p>' + notification_object.title + '</p><p><span class="gray-text" style="font-size: 1.2rem">' + notification_object.artist + '</span></p></div>';
		case "money": 
			var value_is_positive = notification_object.amount > 0;
			var render_class = value_is_positive ? 'green-text' : 'red-text';
			var value_string = (value_is_positive ? '+' : '') + getMoneyValue(notification_object.amount);
			return '<span class="notification ' + render_class + '">' + value_string + '</span>';
		case "xp": return '<span class="notification af-color">+' + getCommaSeparatedValue(notification_object.amount) + 'xp</span>';
		case "store": return '<span class="notification green-text">+' + notification_object.amount + '</span>';
		case "loot": return '<span class="notification gold-text">+' + notification_object.amount + '</span>';
		default: return '<p>something did not work</p>';
	}
}

// var addNotifications = function(type) {

// }

// var addProcNotifications = function() {
// 	try {
// 		$('.notification-wrapper.procs').remove();
// 		$target_area = $('.notification-area.procs');
// 		var unique_id = new Meteor.Collection.ObjectID()._str;
// 		$target_area.append('<div id="' + unique_id + '" class="notification-wrapper af-color procs"></div>');
// 		$wrapper = $('.notification-wrapper.procs');
// 		for (var i=0; i<Meteor.user().profile.notifications.procs.length; i++) {
// 			$wrapper.append('<div class="notification af-color"><p>' + Meteor.user().profile.notifications.procs[i].title + '</p><p><span class="gray-text" style="font-size: 1.2rem">' + Meteor.user().profile.notifications.procs[i].id + '</span></p></div>');
// 		};

// 		Meteor.call('removeNotifications', 'procs', function(error) {
// 			if (error)
// 				console.log(error.message);
// 		})
		
// 		setTimeout(function() {
// 			$('#' + unique_id).remove();
// 		}, 5000);
// 	}

// 	catch (error) {
// 		console.log(error.message);
// 	}
// }

// var addMoneyNotifications = function() {
// 	try {
// 		$('.notification-wrapper.money').remove();
// 		$target_area = $('.notification-area.money');
// 		var unique_id = new Meteor.Collection.ObjectID()._str;
// 		$target_area.append('<div id="' + unique_id + '" class="notification-wrapper af-color money"></div>');
// 		$wrapper = $('.notification-wrapper.money');
// 		for (var i=0; i<Meteor.user().profile.notifications.money.length; i++) {
// 			var notification_object = Meteor.user().profile.notifications.money[i];
// 			var value_is_positive = notification_object.amount > 0;
// 			var render_class = value_is_positive ? 'red-text' : 'green-text';
// 			var value_string = (value_is_positive ? '+' : '-') + getCommaSeparatedValue(notification_object.amount);
// 			$wrapper.append('<span class="notification ' + render_class + '">' + value_string + '</span>');
// 		};

// 		Meteor.call('removeNotifications', 'money', function(error) {
// 			if (error)
// 				console.log(error.message);
// 		})
		
// 		setTimeout(function() {
// 			$('#' + unique_id).remove();
// 		}, 5000);
// 	}

// 	catch (error) {
// 		console.log(error.message);
// 	}
// }

var addNotifications = function(type) {
	try {
		$('.notification-wrapper.' + type).remove();
		$target_area = $('.notification-area.' + type);
		var unique_id = new Meteor.Collection.ObjectID()._str;
		$target_area.append('<div id="' + unique_id + '" class="notification-wrapper ' + type + '"></div>');
		$wrapper = $('.notification-wrapper.' + type);
		for (var i=0; i<Meteor.user().profile.notifications[type].length; i++) {
			$wrapper.append(getNotificationAppendString(Meteor.user().profile.notifications[type][i], type));
		};

		Meteor.call('removeNotifications', type, function(error) {
			if (error)
				console.log(error.message);
		})
		
		setTimeout(function() {
			$('#' + unique_id).remove();
		}, 5000);
	}

	catch (error) {
		console.log(error.message);
	}
}

var updateQuestStatus = function(quest_id) {
	Meteor.call('canTurnInQuest', quest_id, function(error, result) {
		if (error)
			console.log(error.message)

		else {
			quest_statuses[quest_id] = result;
			quest_tracker.changed();
		}
	});
}

Template.navbar.helpers({
	'screen_name' : function() {
		return Meteor.user().profile.screen_name;
	},

	'ticket' : function() {
		return gallery_tickets.find({'ticketholder': Meteor.userId()});
	},

	'ticketData' : function(ticket_object) {
		var gallery_object = galleries.findOne({'owner_id' : ticket_object.gallery_owner});
		if (gallery_object) {
			var unmet_npcs = npcs.findOne({'owner_id': gallery_object.owner_id, 'players_met': {$ne: Meteor.userId()}});

			if (gallery_object) {
				var displayed_object = {
					'owner_name' : gallery_object.owner,
					'owner_id' : ticket_object.gallery_owner,
					'expiration_string' : getTimeString(moment(ticket_object.expiration)),
					'unmet_npcs' : (unmet_npcs != undefined)
				}

				return displayed_object;
			}

			else return {};
		}
	},

	'hasAlerts' : function() {
		if (Meteor.user() == undefined)
			return false;
		
		return alerts.findOne({'user_id': Meteor.userId()}) !== undefined;
	},

	'hasLoot' : function() {
		return items.findOne({'owner': Meteor.userId(), 'status': {$in: ["unclaimed", "won"]}}) !== undefined;
	},

	'hasForSale' : function() {
		return items.findOne({'owner': Meteor.userId(), 'status': "for_sale"}) !== undefined; 
	},

	'hasVisitors' : function() {
		return npcs.findOne({'owner_id': Meteor.userId(), 'players_met': {$ne: Meteor.userId()}}) !== undefined;
	},

	'hasQuest' : function() {
		return quests.findOne({'owner_id': Meteor.userId()}) !== undefined;
	},

	'hasCompletedQuest' : function() {
		var all_quests = quests.find({'owner_id': Meteor.userId()}).fetch();

		for (var i=0; i<all_quests.length; i++) {
			var quest_object = all_quests[i];
			
			var targets_found = 0;
			for (var c=0; c < quest_object.target.length; c++) {
				if (items.findOne({'artwork_id': quest_object.target[c], 'owner': Meteor.userId(), 'status': {$nin: ['unclaimed', 'for_sale', 'won']}}) != undefined)
					targets_found++;
			}

			if (targets_found >= quest_object.min_requirement)
				return true;
		};

		return false;
	},

	'hasFullyCompletedQuest' : function() {
		var all_quests = quests.find({'owner_id': Meteor.userId()}).fetch();

		for (var i=0; i<all_quests.length; i++) {
			var quest_object = all_quests[i];
			
			var targets_found = 0;
			for (var c=0; c < quest_object.target.length; c++) {
				if (items.findOne({'artwork_id': quest_object.target[c], 'owner': Meteor.userId(), 'status': {$nin: ['unclaimed', 'for_sale', 'won']}}) != undefined)
					targets_found++;
			}

			if (targets_found == quest_object.target.length)
				return true;
		};

		return false;
	},

	'notifications': function(type) {
		if (Meteor.user().profile.notifications[type] && Meteor.user().profile.notifications[type].length > 0) {
			addNotifications(type);
		}
	},

	'isNegative': function(amount) {
		return amount < 0;
	}
})

Template.navbar.events({
	'mouseover .nav-icon' : function(element) {
		var button_title = element.target.dataset.title;

		setFootnote(button_title, Math.floor(Math.random() * 1000));
	},

	'mouseover .ticket-button i' : function(element) {
		var owner_name = element.target.dataset.owner_name;
		var expiration_string = element.target.dataset.expiration_string;
		setFootnote("Visit gallery of " + owner_name + ". Expires " + expiration_string + ".", Math.floor(Math.random() * 100000));
	},
})

Template.navbar.rendered = function() {
	$('.notification').bind('afterShow', function() {
		console.log("detected");
	})
}

jQuery(function($) {
	$('.notification').bind('isV')
});
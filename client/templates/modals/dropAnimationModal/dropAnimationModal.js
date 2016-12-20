// var drop_count = 6;

// Template.dropAnimationModal.helpers({
// 	'quality' : function() {
// 		return Session.get('lotteryQuality');
// 	},

// 	'crateQuality' : function() {
// 		return Session.get('rolledQuality');
// 	}
// })

// Template.dropAnimationModal.events({
// 	'click #stop-button' : function() {
// 		$('.reward').show();
// 		$('.pick-section').hide();

// 		Meteor.call('giveDailyDrop', function(error, returned_rarity) {
// 			if (error)
// 				console.log(error.message);

// 			else {
// 				Session.set('update_set', true);
// 			}
// 		})

// 		if (Meteor.user().profile.tutorials.info) {
// 			Blaze.renderWithData(Template.modalTemplate, {
// 				'modal_name': "tutorialModal", 
// 				'modal_data': {
// 					'tutorial_name': "info",
// 					'next': {
// 						'tutorial_name': "action_buttons",
// 						'next': undefined,
// 						'activate': "attributes",
// 						'image_filename': "tutorial/action_buttons.png",
// 						'message': "Cards have action buttons, which appear when you hover over an item. Add your new items to your inventory by clicking the appropriate action button on each, then return to the 'Home' section."
// 					},
// 					'activate': undefined,
// 					'image_filename': "tutorial/info-area.png",
// 					'message': "These items are now yours to claim! To get more info on each, hover over the top of the card to reveal that item's stats."
// 				}
// 			}, $('body')[0]);
// 		}
// 	},

// 	'crateQuality' : function() {
// 		return Session.get('rolledQuality');
// 	}
// })

// Template.dropAnimationModal.rendered = function() {
// 	$('.pick-section').show();
// 	$('.reward').hide();

// 	this.handle = Meteor.setInterval((function() {
// 		var possible_qualities = [
// 			'bronze', 'bronze', 'bronze', 'bronze',  'bronze',
// 			'silver', 'silver', 'silver', 'silver',
// 			'gold', 'gold', 'gold', 
// 			'platinum', 'platinum', 
// 			//'diamond'
// 		];

// 		Session.set('lotteryQuality', possible_qualities[Math.floor(Math.random() * possible_qualities.length)]);
// 	}), 100);
// }

// Template.dropAnimationModal.destroyed = function() {
// 	Meteor.clearInterval(this.handle);
// }
var tutorial_contents_tracker = new Tracker.Dependency;
var $tutorial_contents;

refreshTutorial = function(tutorial_name) {
	var player_interface = new PlayerIF(Meteor.user());
	if (player_interface.readyForTutorial(tutorial_name)) {
		Meteor.call('changeTutorialStep', true, function(error) {
			if (error) {
				console.log(error)
			}

			else {
				buildTutorialContents();
			}
		})
	}
}

tutorial_builder = {
	'intro': function(contents, step) {
		switch(step) {
			case 0: contents.append('<p>Welcome to Artfunkel, a game about collecting rare and valuable artwork!!!</p>'); 
				break;
			case 1: contents.append('<p>Works can be purchased from art dealers, given to you by donors, or found in crates you purchase.</p>'); 
				break;
			case 2: contents.append('<p>The best way to make money and get new art is to meet visitors in other galleries, click the <i class="af-color fa fa-globe"></i> button in the navigation bar to check them out.</p>'); 
				break;
		}
	},

	'galleries': function(contents, step) {
		switch(step) {
			case 0: contents.append('<p>Here’s the gallery menu! Each card shows lots of information about that players’ gallery, but the part we’re interested in is the visitor breakdown (the row of icons).</p>'); 
				break;
			case 1: contents.append('<p>When you hover your mouse over a gallery card, you’ll notice values pop up next to each icon. These icons represent visitor types, and the value shows the likelihood of that visitor type being in that gallery.</p>'); 
				break;
			case 2: contents.append('<p>Click on the <i class="af-color fa fa-sign-in"></i> button of the gallery card to pay the entry fee and enter to meet some visitors.</p>'); 
				break;
		}
	},

	'player_gallery': function(contents, step) {
		switch(step) {
			case 0: contents.append('<p>This is a player gallery! See those icons at the top? Those represent visitors you can meet.</p>'); 
				break;
			case 1: contents.append('<p>This gallery has a benefactor (<i class="af-color fa fa-money"></i>) who gives you money, an enthusiast (<i class="af-color fa fa-smile-o"></i>) who gives you XP, and a donor (<i class="af-color fa fa-share-square fa-flip-horizontal"></i>) who gives you new artworks!</p>'); 
				break;
			case 2: contents.append('<p>Meet each visitor by clicking them, then click the <i class="af-color fa fa-gift"></i> button in the navigation bar to check out your new loot!</p>'); 
				break;
		}
	},

	'loot': function(contents, step) {
		switch(step) {
			case 0: contents.append('<p>Here’s the loot section of your player dashboard, where you’ll find all the items that have been donated to you, as well as items found in crates you purchase.</p>'); 
				break;
			case 1: contents.append('<p>Hovering over an artwork shows you the available actions for that item, most of which are disabled for this tutorial.</p>'); 
				break;
			case 2: contents.append('<p>Go ahead and add these items to your inventory by hovering over them and clicking the <i class="af-color fa fa-plus"></i> button, then click on the inventory tab on your dashboard.</p>'); 
				break;
		}
	},

	'inventory': function(contents, step) {
		switch(step) {
			case 0: contents.append('<p>Now we’re in the inventory section, which shows you all the items you currently own.</p>'); 
				break;
			case 1: contents.append('<p>You’ve seen how visitors can give you bonuses and items, now it’s time to attract some visitors to your own gallery. To do that, we need to display some of your items.</p>'); 
				break;
			case 2: contents.append('<p>The icons at the bottom of each card indicate what visitors that item will attract to your gallery. You’ve got a few that attract art dealers (<i class="af-color fa fa-shopping-cart"></i>) and preservationists (<i class="af-color fa fa-wrench"></i>).</p>'); 
				break;
			case 3: contents.append('<p>Hover over the items and click the <i class="af-color fa fa-picture-o"></i> button to put them in your gallery, then click the gallery tab on your dashboard.</p>')
		}
	},

	'my_gallery': function(contents, step) {
		switch(step) {
			case 0: contents.append('<p>Now we’re in your personal gallery, and you’ve already attracted a visitor! Visitors in your own gallery give you better bonuses than those in other galleries.</p>'); 
				break;
			case 1: contents.append('<p>Meet the Art Dealer, then click the <i class="af-color fa fa-shopping-cart"></i> button in the navigation bar to see what kind of offers you have in the store.</p>'); 
				break;
		}
	},

	'store': function(contents, step) {
		switch(step) {
			case 0: contents.append('<p>This is the store, where you can find purchasable crates of items as well as offers you receive from art dealers.</p>'); 
				break;
			case 1: contents.append('<p>The Dealer you met is offering an item that looks pretty good for your gallery, purchase it by hovering over the item and clicking the <i class="af-color fa fa-shopping-cart"></i> button.</p>'); 
				break;
			case 2: contents.append('<p>You’ll want to put this item up in your gallery too, but first we need to make a few modifications. Click <i class="af-color fa fa-home"></i> to return home, then head back to your inventory.</p>'); 
				break;
		}
	},

	'mod_intro': function(contents, step) {
		switch(step) {
			case 0: contents.append('<p>Your new item is <span style="font-style:italic">ALMOST</span> perfect for displaying. You’ll want to make sure your gallery is optimized to attract the visitors you want most, which means all of your display items should have similar attributes.</p>'); 
				break;
			case 1: contents.append('<p>You can change certain attributes by hovering over an item and clicking the <i class="af-color fa fa-magic"></i> button. Do this to the item you just purchased.</p>'); 
				break;
		}
	},

	'mod_attribute': function(contents, step) {
		switch(step) {
			case 0: contents.append('<p>This is the Mod menu. Here you can spend money to modify attributes and their values to make an item a better fit for your gallery.</p>'); 
				break;
			case 1: contents.append('<p>That Historian attribute will do you no good attracting more Dealers and Preservationists, so click the “attribute” button in that row to change it.</p>'); 
				break;
		}
	},

	'mod_value': function(contents, step) {
		switch(step) {
			case 0: contents.append('<p>First try! What are the odds?!?! Now this item’s attributes are all set, but 12 is a pretty low value.</p>'); 
				break;
			case 1: contents.append('<p>The higher the value, the more likely those visitors will show up in your gallery. Click the “value” button to change the value of that particular attribute.</p>'); 
				break;
		}
	},

	'display_modded': function(contents, step) {
		switch(step) {
			case 0: contents.append('<p>Perfect, 96 is way better than 12! Now this item is a much better fit for your gallery.</p>'); 
				break;
			case 1: contents.append('<p>Close the Mod menu and put your newly-modded item up with the rest of your works.</p>'); 
				break;
		}
	},

	'outro': function(contents, step) {
		switch(step) {
			case 0: contents.append('<p>You’ve now learned the basic mechanics of Artfunkel. Meet visitors, get new items, modify them as you wish, and curate your own gallery. But there’s an awful lot more to the game, including an auction house, artwork forging, quests, your personal archive, and a weekly lottery to name a few.</p>'); 
				break;
			case 1: contents.append('<p>To learn more about the game, please visit the <a target="_blank" href="http://artfunkel.wikia.com/wiki/Artfunkel_Wiki">wiki</a> and join the <a target="_blank" href="https://discord.gg/A9baZCh">discord channel</a>, where you can ask for help or tips from the developer and/or seasoned Artfunkel veterans.</p>'); 
				break;
			case 2: contents.append('<p>Thanks for playing, and good luck!</p>')
				break;
		}
	}
}

buildTutorialContents = function() {
	var current_state = TUTORIAL_STATES[Meteor.user().profile.tutorial_data.state];
	var current_step =  Meteor.user().profile.tutorial_data.step;

	$tutorial_contents = $('.tutorial-text');
	$tutorial_contents.empty();

	tutorial_builder[current_state]($tutorial_contents, current_step);
}

Template.tutorials.rendered = function() {
	buildTutorialContents();
}

Template.tutorials.events({
	'click #exit-tutorial': function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "exitTutorialModal", 
			'modal_data': {}
		}, $('body')[0]);
	}
})

Template.tutorialPageButtons.helpers({
	'back_button': function() {
		return Meteor.user().profile.tutorial_data.step > 0;
	},

	'next_button': function() {
		var current_state = TUTORIAL_STATES[Meteor.user().profile.tutorial_data.state];
		var current_step =  Meteor.user().profile.tutorial_data.step;

		var is_last_step = current_step == TUTORIAL_STATE_STEPS[current_state] - 1;

		return !is_last_step;
	},

	'finish_button': function() {
		var current_state = TUTORIAL_STATES[Meteor.user().profile.tutorial_data.state];
		var current_step =  Meteor.user().profile.tutorial_data.step;

		var is_last_step = current_step == TUTORIAL_STATE_STEPS[current_state] - 1;
		var is_last_state = Meteor.user().profile.tutorial_data.state == TUTORIAL_STATES.length - 2;
		return is_last_step && is_last_state;
	},

	'skip_button': function() {
		var tutorial_data = Meteor.user().profile.tutorial_data;
		return tutorial_data && tutorial_data.state == 0 && tutorial_data.step == 0;
	}
})

Template.tutorialPageButtons.events({
	'click .back-button': function(event) {
		event.stopPropagation();
		Meteor.call('changeTutorialStep', false, function(error) {
			if (error) {
				console.log(error)
			}

			else {
				buildTutorialContents();
			}
		})
	},

	'click .next-button': function(event) {
		event.stopPropagation();
		Meteor.call('changeTutorialStep', true, function(error) {
			if (error) {
				console.log(error)
			}

			else {
				buildTutorialContents();
			}
		})
	},

	'click .finish-button, click .skip-button': function(event) {
		event.stopPropagation();
		Meteor.call('finishTutorials', function(error) {
			if (error) {
				console.log(error)
			}

			updateItemArray()
		})
	}
})
TutorialHandler = function() {
	var tutorials = [];

	this.add = function(name, html_string_array) {
		tutorials[name] = html_string_array;
	}

	this.getNext = function(current_tutorial, current_step) {
		if (current_tutorial == undefined) {
			return undefined;
		}

		var current_tutorial_array = tutorials[current_tutorial];
		return current_tutorial_array && current_step >= current_tutorial_array.length - 1 ? undefined : current_step + 1;
	}

	this.getText = function(current_tutorial, current_step) {
		if (current_tutorial && tutorials[current_tutorial] && tutorials[current_tutorial].length > current_step) {
			return tutorials[current_tutorial][current_step];
		}
	}

	this.getNames = function() {
		return Object.keys(tutorials);
	}
}

TUTORIAL_HANDLER = new TutorialHandler();

Meteor.methods({
	'nextTutorialStep': function() {
		var player_interface = new PlayerIF(Meteor.user());
		return player_interface.nextTutorialStep();
	},

	'previousTutorialStep': function() {
		var player_interface = new PlayerIF(Meteor.user());
		return player_interface.previousTutorialStep();
	},

	'getTutorialText': function() {
		var player_interface = new PlayerIF(Meteor.user());
		return player_interface.getTutorialText();
	},

	'getTutorialStepPermissions': function() {
		var player_interface = new PlayerIF(Meteor.user());
		return {
			'previous': player_interface.getUserObject().profile.tutorial_data.step > 0,
			'next': player_interface.hasNextTutorialStep()
		}
	},

	'getTutorialNames': function() {
		return TUTORIAL_HANDLER.getNames();
	}
})


TUTORIAL_HANDLER.add("artfunkel basics", [
	'<p>Welcome to Artfunkel, a game about collecting rare and valuable artwork!!!</p>',
	'<p>Works can be purchased from art dealers, given to you by donors, or found in crates you purchase.</p>',
	'<p>The best way to make money and get new art is to meet visitors in other galleries, click the <i class="af-color fa fa-globe"></i> button in the navigation bar to check them out.</p>',
	'<p>In the gallery menu, each card shows lots of information about that players’ gallery, but the part we’re interested in is the visitor breakdown (the row of icons).</p>',
	'<p>When you hover your mouse over a gallery card, you’ll notice values pop up next to each icon. These icons represent visitor types, and the value shows the likelihood of that visitor type being in that gallery.</p>',
	'<p>Click on the <i class="af-color fa fa-sign-in"></i> button of the gallery card to pay the entry fee and enter to meet some visitors.</p>',
	'<p>In the player gallery area, you can view other players\' displayed items. The icons at the top represent visitors you can meet, who give you various bonuses.</p>',
	'<p>For example has a benefactor (<i class="af-color fa fa-money"></i>) gives you money, an enthusiast (<i class="af-color fa fa-smile-o"></i>) gives you XP, and a donor (<i class="af-color fa fa-share-square fa-flip-horizontal"></i>) gives you new artworks!</p>',
	'<p>Meet each visitor by left-clicking on their icon. You can also right-click to dismiss them instead.</p>',
	'<p>When you have new loot available to you, the <i class="af-color fa fa-gift"></i> icon will appear in the nav bar. Items in this section are automatically removed if they are not claimed before a certain amount of time.</p>',
	'<p>Hovering over an artwork shows you the available actions for that item (be sure to check the "item actions" tutorial to learn more about each).</p>',
	'<p>To attract visitors to your own gallery, you need to display some of your items. Visit galleries, purchase crates, or collect your "daily drop" from the loot area to start your collection. Once you\'ve added a few artworks to your collection, go to your inventory and click "next".</p>',
	'<p>The icons at the bottom of each card are called "attributes". They indicate what visitors that item will attract to your gallery. Hover over the items and click the <i class="af-color fa fa-picture-o"></i> button to put them in your gallery, then click the gallery tab on your dashboard.</p>',
	'<p>Once you have put items up for display, your gallery will be capable of attracting its own visitors. Visitors in your own gallery give you better bonuses than those in other galleries.</p>',
	'<p>Next, click the <i class="af-color fa fa-shopping-cart"></i> button in the navigation bar to check out the store.</p>',
	'<p>From the store you can find purchasable crates of items as well as offers you receive from art dealers.</p>',
	'<p>Purchase one of the crates available, claim your new items from the loot page, then head back to your inventory.</p>',
	'<p>You’ll want to make sure your gallery is optimized to attract the visitors you want most, which means all of your display items should have similar attributes.</p>',
	'<p>You can change certain attributes by hovering over an item and clicking the <i class="af-color fa fa-magic"></i> button. Do this to one of your items (that isn\'t currently on display).</p>',
	'<p>From the mod menu, you can spend money to modify attributes and their values to make an item a better fit for your gallery.</p>',
	'<p>To change an attribute, and therefore changing the type of visitors it attracts, click the “attribute” button. Note: this also randomizes the attribute value.</p>',
	'<p>The higher the attribute value, the more likely those visitors will show up in your gallery. Click the “value” button to change the value of that particular attribute to a new random value.</p>',
	'<p>You might notice the more you "reroll" an item, the more it costs to modify. To reduce the "roll count" of an item, you\'ll have to meet Art Experts in galleries.</p>',
	'<p>You’ve now learned the basic mechanics of Artfunkel. Meet visitors, get new items, modify them as you wish, and curate your own gallery. But there’s an awful lot more to the game, including an auction house, artwork forging, quests, your personal archive, and a weekly lottery to name a few.</p>',
	'<p>To learn more about the game, please visit the <a target="_blank" href="http://artfunkel.wikia.com/wiki/Artfunkel_Wiki">wiki</a> and join the <a target="_blank" href="https://discord.gg/A9baZCh">discord channel</a>, where you can ask for help or tips from the developer and/or seasoned Artfunkel veterans.</p>',
	'<p>You can also replay this tutorial or try others by clicking the <i class="fa fa-question af-color"></i> button in your navigation bar.</p>',
	'<p>Thanks for playing, and good luck!</p>'
])

TUTORIAL_HANDLER.add("item actions", [
	'<p>Hovering over an item shows all of the possible actions you can take for that particular item.</p>',
	'<p><i class="af-color fa fa-usd"></i> - SELL<p>Removes the item from your inventory, giving you money proportionate to its value.</p></p>',
	'<p><i class="af-color fa fa-gavel"></i> - AUCTION<p>Put the item up for auction to be purchased by other players.</p></p>',
	'<p><i class="af-color fa fa-share-square"></i> - DONATE<p>Removes the item from your inventory in exchange for knowledge, a currency that allows you to improve your items.</p></p>',
	'<p><i class="af-color fa fa-magic"></i> - MOD<p>Modify the attributes of your items and level them up, increasing their worth.</p></p>',
	'<p><i class="af-color fa fa-archive"></i> - ARCHIVE<p>Remove the item from your inventory and place it in your archive, where it can no longer be modified in any way.</p></p>',
	'<p><i class="af-color fa fa-shopping-cart"></i> - PURCHASE (store only)<p>Pay the listed fee to add the item to your inventory.</p></p>',
	'<p><i class="af-color fa fa-times"></i> - DECLINE/DELETE<p>Removes the item from the game entirely.</p></p>',
	'<p><i class="af-color fa fa-picture-o"></i> - DISPLAY<p>Add the item to your gallery, earning bonuses and attracting visitors.</p></p>',
	'<p><i class="af-color fa fa-heart"></i> - FAVORITE<p>Marks your favorite items, which displays them in your gallery without earning any bonuses or attracting visitors.</p></p>',
	'<p><i class="af-color fa fa-binoculars"></i> - MARK FOR SALE<p>Marks the item "for sale". When you meet Collectors in galleries, they will give you large sums of money for the items you are selling.</p></p>',
	'<p><i class="af-color fa fa-wrench"></i> - REPAIR<p>Repairing items will have their condition increased every hour.</p></p>',
	'<p><i class="af-color fa fa-tags"></i> - TAG<p>Add special tags to your items, making them easy to find in your inventory. If you tag multiple items "primary", you can enter "#primary" in the inventory search to see only items you\'ve tagged.</p></p>',
	'<p><i class="af-color fa fa-search"></i> - IDENTIFY<p>Lets you pay a fee to find out if an item you\'ve purchased in the auction house is a forgery or not.</p></p>',
	'<p><i class="af-color fa fa-shield"></i> - REDEEM<p>If you find out you purchased a forgery, you may redeem that item within a certain timeframe, getting your money back and earning bonuses based on the item.</p></p>',
	'<p>Now you know what stuff does, go do some stuff!</p>'

])

TUTORIAL_HANDLER.add("forging", [
	'<p>Players have the ability to forge artworks!</p>',
	'<p>To create a forgery, you have to meet a Forger in a player gallery. Unlike other visitors, Forgers don\'t look like their associated attribute icon (<i class="af-color fa fa-user-secret"></i>).</p>',
	'<p>Instead, they appear disguised as one of the other visitor types. To find forgers, you\'ll have to visit galleries and meet everyone you can.</p>',
	'<p>Once you meet a Forger, they will offer you a forgery contract, and a forger icon will appear in your nav bar (<i class="red-text fa fa-user-secret"></i>).</p>',
	'<p>To use the contract, select it in the forge menu, search and select a work of art, customize it as you wish, and click the "forge item" button. Note: you are only allowed to forge items that have been added to your archive.</p>',
	'<p>Once created, the forged item is placed in your loot area for you to claim. Be sure to check out the <a target="_blank" href="http://artfunkel.wikia.com/wiki/Forgeries">artfunkel wiki</a> to better understand how Forgeries work in the game.</p>'
])

TUTORIAL_HANDLER.add("vintage mode", [
	'<p>Once you hit the maximum level (' + PLAYER_LEVEL_MAX + '), you are given the option to enter "vintage mode."</p>',
	'<p>When vintage mode is activated, you lose all of your money, and you are allowed to keep 1 of your items (archived items also remain). All of your other items will be removed from the game.</p>',
	'<p>The item you keep becomes a special "vintage" item, which doubles its value and increases the amount of money it earns while on display.</p>',
	'<p>In addition, vintage items do not count against your inventory space, and if you hit level ' + PLAYER_LEVEL_MAX + ' and want to "vintage" again, the vintage items you already have will remain in your inventory!</p>'
])

TUTORIAL_HANDLER.add("archiving", [
	'<p>Archiving is a way for you to keep record of the items you\'ve collected without them taking up space in your inventory.<p>',
	'<p>Once an item is archived, it can be viewed from the "archive" tab in your dashboard. These items cannot be modified or offloaded in any way, aside from tagging or deleting.</p>',
	'<p>To archive an item you own (that isn\'t on display or auctioned), hover over the item and select the (<i class="af-color fa fa-archive"></i>) button.</p>',
	'<p>The archive has some restrictions. You can only have one of each item type for a particular artwork. For instance, you cannot have multiple <span class="af-color">foil</span> versions of the same painting. You would need to pick the one you wanted to keep most.</p>',
	'<p>However, if you had a <span class="af-color">foil</span> version, and a <span class="af-color">foil</span> <span class="unlocked-text">unlocked</span> version, you can archive them both, as they are technically different types.</p>',
	'<p>Items that have the archive icon (<i class="green-text fa fa-archive"></i>) in the upper-left corner indicate that that particular item type is not yet in your archive.</p>',
	'<p>The upgrade icon (<i class="green-text fa fa-level-up"></i>) indicates that you already have an archived version of that type, but this one is more valuable.</p>',
	'<p>Those are the archiving basics. More information is available on the <a target="_blank" href="http://artfunkel.wikia.com/wiki/Archive">artfunkel wiki</a>. Also check out the archive-specific leaderboards to see what other players have stashed away. Happy archiving!</p>'
])
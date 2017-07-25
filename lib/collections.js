alerts = new Mongo.Collection("alerts");
artists = new Mongo.Collection("artists");
artworks = new Mongo.Collection("artworks");
attributes = new Mongo.Collection("attributes");
unique_attributes = new Mongo.Collection("unique_attributes");
auctions = new Mongo.Collection("auctions");
items = new Mongo.Collection("items");
npcs = new Mongo.Collection("npcs");
galleries = new Mongo.Collection("galleries");
gallery_finishes = new Mongo.Collection("gallery_finishes");
gallery_tickets = new Mongo.Collection("gallery_tickets");
quests = new Mongo.Collection("quests");
metadata = new Mongo.Collection("metadata");
crates = new Mongo.Collection("crates");
forgery_contracts = new Mongo.Collection("forgery_contracts");
// removed_items = new Mongo.Collection("removed_items");

if (Meteor.isServer) {
    Meteor.publish("alerts", function() {
        return alerts.find({"user_id": this.userId});
    });

    Meteor.publish("artists", function() {
        return artists.find({});
    });

    Meteor.publish("artworks", function() {
        return artworks.find({});
    });

    Meteor.publish("attributes", function() {
        return attributes.find({});
    });

    Meteor.publish("unique_attributes", function() {
        return unique_attributes.find({});
    });

    Meteor.publish("auctions", function() {
        return auctions.find({'viewer': {$in: [this.userId, "public"]}}, {fields: {
            '_id': 1, 
            'min_bid': 1, 
            'buy_now': 1, 
            'seller': 1, 
            'expiration': 1, 
            'has_bid': 1, 
            'item_id': 1, 
            'viewer': 1, 
            'date_posted': 1,
            'item_data.artwork_data': 1
        }});
    });

    Meteor.publish("items", function() {
        // return items.find({});
        return items.find({$or: [
            {'owner': {$in: [this.userId, BOT_USER_NAME]}}, 
            {$or: [{'permanent': true}, {'status': 'displayed'}]}
        ]}, {fields: {
            'authenticity.forgery': 0,
            'authenticity.liability_pending': 0
        }});
    });

    Meteor.publish("npcs", function() {
        return npcs.find({});
    });

    Meteor.publish("galleries", function() {
        return galleries.find({}, {fields: {'procs': 0}});
    });

    Meteor.publish("gallery_finishes", function() {
        return gallery_finishes.find({});
    });

    Meteor.publish("gallery_tickets", function() {
        //TODO remove owner id
        return gallery_tickets.find({});
    });

    Meteor.publish("quests", function() {
        return quests.find({});
    });

    Meteor.publish("metadata", function() {
        return metadata.find();
    });

    Meteor.publish("crates", function() {
        return crates.find({$or: [{'owner_id': this.userId}, {'type': "public"}]});
    });

    Meteor.publish("forgery_contracts", function() {
        return forgery_contracts.find({'owner_id': this.userId});
    });

    // Meteor.publish('removed_items', function() {
    //     return removed_items.find();
    // })
}

if (Meteor.isClient) {
    Meteor.subscribe("alerts");
    Meteor.subscribe("artists");
    Meteor.subscribe("artworks");
    Meteor.subscribe("attributes");
    Meteor.subscribe("unique_attributes");
    Meteor.subscribe("auctions");
    Meteor.subscribe("items");
    Meteor.subscribe("npcs");
    Meteor.subscribe("galleries");
    Meteor.subscribe("gallery_finishes");
    Meteor.subscribe("gallery_tickets");
    Meteor.subscribe("quests");
    Meteor.subscribe("metadata");
    Meteor.subscribe("crates");
    Meteor.subscribe("forgery_contracts");
}

Meteor.users.deny({
  update: function() {
    return Meteor.user().profile.user_type != "admin";
  }
});

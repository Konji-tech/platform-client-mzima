import LoginFunctions from '../../functions/LoginFunctions';
import PostFunctions from '../../functions/PostsFunctions/PostFunctions';

describe('Automated Tests for Posts', () => {
  const loginFunctions = new LoginFunctions();
  const postFunctions = new PostFunctions();

  beforeEach(() => {
    loginFunctions.login_as_admin();
    cy.visit(Cypress.env('baseUrl'));
  });

  it('Creates and verifies a post', () => {
    postFunctions.open_post_creation_form();
    postFunctions.fill_required_form_fields();
    postFunctions.complete_add_post_steps();
    postFunctions.verify_created_post_exists();
  });

  it.skip('Verifies post details', () => {
    postFunctions.open_post_for_details();
    postFunctions.verify_post_details();
  });
  it('Changes and verifies status of a post', () => {
    postFunctions.open_post_creation_form();
    postFunctions.fill_required_form_fields();
    postFunctions.complete_add_post_steps();
    postFunctions.change_post_status();
  });
  it.skip('Deletes a post', () => {
    postFunctions.delete_post();
  });
});

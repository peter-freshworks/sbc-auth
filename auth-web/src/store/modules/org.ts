import { Account, Actions, SessionStorageKeys } from '@/util/constants'
import { Action, Module, Mutation, VuexModule } from 'vuex-module-decorators'
import {
  AddUsersToOrgBody,
  BulkUsersFailed,
  BulkUsersSuccess,
  CreateRequestBody as CreateOrgRequestBody,
  CreateRequestBody,
  Member,
  Organization,
  UpdateMemberPayload
} from '@/models/Organization'
import { BcolAccountDetails, BcolProfile } from '@/models/bcol'
import { CreateRequestBody as CreateInvitationRequestBody, Invitation } from '@/models/Invitation'
import { Products, ProductsRequestBody } from '@/models/Staff'
import { TransactionDateFilter, TransactionTableList, TransactionTableRow } from '@/models/transaction'
import { AccountSettings } from '@/models/account-settings'
import { Address } from '@/models/address'
import BcolService from '@/services/bcol.services'
import ConfigHelper from '@/util/config-helper'
import { EmptyResponse } from '@/models/global'
import InvitationService from '@/services/invitation.services'
import OrgService from '@/services/org.services'
import PaymentService from '@/services/payment.services'
import { PaymentSettings } from '@/models/PaymentSettings'
import StaffService from '@/services/staff.services'
import UserService from '@/services/user.services'
import { UserSettings } from 'sbc-common-components/src/models/userSettings'

@Module({
  name: 'org',
  namespaced: true
})
export default class OrgModule extends VuexModule {
  list = []
  resending = false
  sentInvitations: Invitation[] = []
  failedInvitations: Invitation[] = []
  currentAccountSettings: AccountSettings = undefined
  currentOrganization: Organization = undefined
  currentOrgAddress:Address = undefined
  currentMembership: Member = undefined
  activeOrgMembers: Member[] = []
  pendingOrgMembers: Member[] = []
  pendingOrgInvitations: Invitation[] = []
  currentOrgPaymentSettings:PaymentSettings =undefined
  invalidInvitationToken = false
  tokenError = false
  createdUsers: BulkUsersSuccess[] = []
  failedUsers: BulkUsersFailed[] = []
  accountTypeBeforeChange = '' // used for detecting the original type of the account which is getting down/up graded

  currentOrgTransactionList: TransactionTableRow[] = []
  @Mutation
  public setCurrentOrgPaymentSettings (currentOrgPaymentSettings:PaymentSettings) {
    this.currentOrgPaymentSettings = currentOrgPaymentSettings
  }

  @Mutation
  public setAccountTypeBeforeChange (accountTypeBeforeChange:string) {
    this.accountTypeBeforeChange = accountTypeBeforeChange
  }

  @Mutation
  public setGrantAccess (grantAccess: boolean) {
    if (this.currentOrganization) {
      this.currentOrganization.grantAccess = grantAccess
    }
  }

  @Mutation
  public resetCurrentOrganisation () {
    this.currentOrganization = { name: '' }
  }

  @Mutation
  public resetBcolDetails () {
    this.currentOrganization.bcolProfile = undefined
    this.currentOrganization.bcolAccountDetails = undefined
    this.currentOrgAddress = undefined
  }

  @Mutation
  public setSelectedAccountType (selectedAccountType: Account | undefined) {
    if (this.currentOrganization) {
      this.currentOrganization.orgType = selectedAccountType
    }
  }

  @Mutation
  public setActiveOrgMembers (activeMembers: Member[]) {
    this.activeOrgMembers = activeMembers
  }

  @Mutation
  public setPendingOrgMembers (pendingMembers: Member[]) {
    this.pendingOrgMembers = pendingMembers
  }

  @Mutation
  public setPendingOrgInvitations (pendingInvitations: Invitation[]) {
    this.pendingOrgInvitations = pendingInvitations
  }

  @Mutation
  public setCurrentAccountSettings (accountSettings: AccountSettings) {
    this.currentAccountSettings = accountSettings
  }

  @Mutation
  public resetInvitations () {
    this.resending = false
    this.sentInvitations = []
    this.failedInvitations = []
  }

  @Mutation
  public addSentInvitation (sentInvitation: Invitation) {
    this.sentInvitations.push(sentInvitation)
  }

  @Mutation
  public addFailedInvitation (failedInvitation: Invitation) {
    this.failedInvitations.push(failedInvitation)
  }

  @Mutation
  public setResending (resendingStatus: boolean) {
    this.resending = resendingStatus
  }

  @Mutation
  public setCurrentOrganization (organization: Organization | undefined) {
    this.currentOrganization = organization
  }

  @Mutation
  public setCurrentMembership (membership: Member) {
    this.currentMembership = membership
  }

  @Mutation
  public setCreatedUsers (users: BulkUsersSuccess[]) {
    this.createdUsers = users
  }

  @Mutation
  public setFailedUsers (users: BulkUsersFailed[]) {
    this.failedUsers = users
  }

  @Mutation
  public setCurrentOrgTransactionList (transactionResp: TransactionTableList) {
    this.currentOrgTransactionList = transactionResp.transactionsList
  }

  @Action({ rawError: true })
  public async resetCurrentOrganization (): Promise<void> {
    this.context.commit('setCurrentOrganization', undefined)
    this.context.commit('setActiveOrgMembers', [])
    this.context.commit('setPendingOrgMembers', [])
    this.context.commit('setPendingOrgInvitations', [])
  }

  @Action({ rawError: true })
  public async syncOrganization (orgId: number): Promise<Organization> {
    const response = await OrgService.getOrganization(orgId)
    const organization = response?.data
    this.context.commit('setCurrentOrganization', organization)
    return organization
  }

  @Action({ rawError: true, commit: 'setCurrentMembership' })
  public async syncMembership (orgId: number): Promise<Member> {
    const response = await UserService.getMembership(orgId)
    return response?.data
  }

  /*
   * staff doesnt need any other store set up's since he doesnt belong to an account
   * So a minimal method to create org
   */
  @Action({ rawError: true })
  public async createOrgByStaff (createRequestBody: CreateOrgRequestBody): Promise<Organization> {
    const response = await OrgService.createOrg(createRequestBody)
    this.context.commit('setCurrentOrganization', response?.data)
    return response?.data
  }

  @Action({ rawError: true })
  public async changeOrgType (action:Actions): Promise<Organization> {
    const org:Organization = this.context.state['currentOrganization']
    let createRequestBody: CreateRequestBody = {
      name: org.name,
      typeCode: org.orgType
    }
    if (org.orgType === Account.PREMIUM) {
      createRequestBody.bcOnlineCredential = org.bcolProfile
      createRequestBody.mailingAddress = this.context.state['currentOrgAddress']
    }
    const response = await OrgService.upgradeOrDowngradeOrg(createRequestBody, org.id, action)
    const organization = response?.data
    this.context.commit('setCurrentOrganization', organization)
    this.context.commit('setAccountTypeBeforeChange', organization.orgType)
    return response?.data
  }

  @Action({ rawError: true })
  public async createOrg (): Promise<Organization> {
    const org = this.context.state['currentOrganization']
    const address = this.context.state['currentOrgAddress']
    const createRequestBody: CreateRequestBody = {
      name: org.name
    }
    if (org.bcolProfile) {
      createRequestBody.bcOnlineCredential = org.bcolProfile
      createRequestBody.mailingAddress = address
    }
    const response = await OrgService.createOrg(createRequestBody)
    const organization = response?.data
    this.context.commit('setCurrentOrganization', organization)
    if (organization) { // avoid junk
      const usersettings: UserSettings = {
        id: organization.id.toString(),
        label: organization.name,
        type: 'ACCOUNT',
        urlorigin: '',
        urlpath: `/account/${organization.id}/settings`

      }
      ConfigHelper.addToSession(SessionStorageKeys.CurrentAccount, JSON.stringify(usersettings))
    }
    return response?.data
  }

  @Mutation
  public setCurrentOrganizationAddress (address: Address | undefined) {
    this.currentOrgAddress = address
  }

  @Action({ rawError: true })
  public async validateBcolAccount (bcolProfile: BcolProfile): Promise<BcolAccountDetails> {
    return BcolService.validateBCOL(bcolProfile)
  }

  @Action({ rawError: true })
  public async isOrgNameAvailable (name: string) {
    const response = await OrgService.isOrgNameAvailable(name)
    if (response.status === 204) {
      return true
    } else {
      return false
    }
  }

  @Action({ rawError: true })
  public async updateOrg (createRequestBody: CreateOrgRequestBody) {
    const response = await OrgService.updateOrg(this.context.state['currentOrganization'].id, createRequestBody)
    this.context.commit('setCurrentOrganization', response.data)
    return response?.data
  }

  @Action({ rawError: true })
  public async createInvitation (invitation: CreateInvitationRequestBody) {
    try {
      const response = await InvitationService.createInvitation(invitation)
      if (!response || !response.data || response.status !== 201) {
        throw new Error('Unable to create invitation')
      }
      this.context.commit('addSentInvitation', response.data)
      this.context.dispatch('syncPendingOrgInvitations')
    } catch (exception) {
      this.context.commit('addFailedInvitation', invitation)
      throw exception
    }
  }

  @Action({ rawError: true })
  public async resendInvitation (invitation: Invitation) {
    this.context.commit('resetInvitations')
    this.context.commit('setResending', true)
    try {
      await InvitationService.resendInvitation(invitation)
      this.context.commit('addSentInvitation', invitation)
    } catch (exception) {
      this.context.commit('addFailedInvitation', invitation)
    }
  }

  @Action({ rawError: true })
  public async deleteInvitation (invitationId: number) {
    const response = await InvitationService.deleteInvitation(invitationId)
    if (!response || response.status !== 200 || !response.data) {
      throw Error('Unable to delete invitation')
    }
    this.context.dispatch('syncPendingOrgInvitations')
  }

  @Mutation
  public setInvalidTokenStatus (status:boolean) {
    this.invalidInvitationToken = status
  }

  @Mutation
  public setTokenErrorStatus (status:boolean) {
    this.tokenError = status
  }

  @Action({ rawError: true })
  public async validateInvitationToken (token: string): Promise<EmptyResponse> {
    try {
      const response = await InvitationService.validateToken(token)
      this.context.commit('setInvalidTokenStatus', false)
      this.context.commit('setTokenErrorStatus', false)
      return response && response.data ? response.data : undefined
    } catch (err) {
      if (err.response.status === 400) {
        this.context.commit('setTokenErrorStatus', false)
        this.context.commit('setInvalidTokenStatus', true)
      } else {
        this.context.commit('setTokenErrorStatus', true)
        this.context.commit('setInvalidTokenStatus', false)
      }
    }
  }

  @Action({ rawError: true })
  public async acceptInvitation (token: string): Promise<Invitation> {
    const response = await InvitationService.acceptInvitation(token)
    return response && response.data ? response.data : undefined
  }

  @Action({ rawError: true })
  public async dissolveTeam () {
    // Send request to remove member on server and get result
    const response = await OrgService.deactivateOrg(this.context.state['currentOrganization'].id)

    // If no response, or error code, throw exception to be caught
    if (!response || response.status !== 204) {
      throw Error('Unable to dissolve organisation')
    }
  }

  @Action({ rawError: true })
  public async leaveTeam (memberId: number) {
    // Send request to remove member on server and get result
    const response = await OrgService.leaveOrg(this.context.state['currentOrganization'].id, memberId)

    // If no response, or error code, throw exception to be caught
    if (!response || response.status !== 200 || !response.data) {
      throw Error('Unable to delete member')
    } else {
      this.context.dispatch('syncActiveOrgMembers')
    }
  }

  @Action({ rawError: true })
  public async updateMember (updatePayload: UpdateMemberPayload) {
    // Send request to update member on server and get result
    const response = await OrgService.updateMember(this.context.state['currentOrganization'].id, updatePayload)

    // If no response or error, throw exception to be caught
    if (!response || response.status !== 200 || !response.data) {
      throw Error('Unable to update member role')
    } else {
      this.context.dispatch('syncActiveOrgMembers')
      this.context.dispatch('syncPendingOrgMembers')
      this.context.dispatch('syncMembership', this.context.state['currentOrganization'].id)
    }
  }

  @Action({ rawError: true })
  public async deleteUser (userId: string) {
    // Send request to update member on server and get result
    const response = await UserService.deleteAnonymousUser(userId)

    // If no response or error, throw exception to be caught
    if (!response || response.status !== 204) {
      throw Error('Unable to remove user')
    } else {
      this.context.dispatch('syncActiveOrgMembers')
      this.context.dispatch('syncPendingOrgMembers')
    }
  }

  @Action({ commit: 'setActiveOrgMembers', rawError: true })
  public async syncActiveOrgMembers () {
    const response = await OrgService.getOrgMembers(this.context.state['currentOrganization'].id, 'ACTIVE')
    return response.data && response.data.members ? response.data.members : []
  }

  @Action({ commit: 'setCurrentOrgPaymentSettings', rawError: true })
  public async syncPaymentSettings () {
    const response = await OrgService.getPaymentSettings(this.context.state['currentOrganization'].id)
    return response.data
  }

  @Action({ rawError: true })
  public async syncAddress () {
    const contact = await OrgService.getContactForOrg(this.context.state['currentOrganization'].id)
    // the contact model has lot of values which are not address..strip them off
    const address:Address = { region: contact.region,
      city: contact.city,
      postalCode: contact.postalCode,
      country: contact.country,
      street: contact.street,
      streetAdditional: contact.streetAdditional }
    this.context.commit('setCurrentOrganizationAddress', address)
  }

  @Action({ commit: 'setPendingOrgMembers', rawError: true })
  public async syncPendingOrgMembers () {
    const response = await OrgService.getOrgMembers(this.context.state['currentOrganization'].id, 'PENDING_APPROVAL')
    return response.data && response.data.members ? response.data.members : []
  }

  @Action({ commit: 'setPendingOrgInvitations', rawError: true })
  public async syncPendingOrgInvitations () {
    const response = await OrgService.getOrgInvitations(this.context.state['currentOrganization'].id, 'PENDING')
    return response.data && response.data.invitations ? response.data.invitations : []
  }

  @Action({ rawError: true })
  public async addProductsToOrg (productsRequestBody: ProductsRequestBody): Promise<Products> {
    const response = await StaffService.addProducts(this.context.state['currentOrganization'].id, productsRequestBody)
    return response?.data
  }

  @Action({ rawError: true })
  public async createUsers (addUserBody: AddUsersToOrgBody) {
    try {
      const response = await UserService.createUsers(addUserBody)
      if (!response || !response.data || ![200, 201, 207].includes(response.status) || !response.data?.users) {
        throw new Error('Unable to create users')
      } else {
        let users = response.data.users
        let successUsers: BulkUsersSuccess[] = []
        let failedUsers: BulkUsersFailed[] = []
        users.forEach((user) => {
          if (user.http_status === 201) {
            const password = (addUserBody.users.find(({ username }) => username === user.firstname))?.password
            successUsers.push({
              username: user.firstname,
              password: password
            })
          } else {
            failedUsers.push({
              username: user.username,
              error: user.error
            })
          }
        })
        this.context.commit('setCreatedUsers', successUsers)
        this.context.commit('setFailedUsers', failedUsers)
        await this.context.dispatch('syncActiveOrgMembers')
      }
    } catch (exception) {
      throw exception
    }
  }

  @Action({ commit: 'setCurrentOrgTransactionList', rawError: true })
  public async getTransactionList (dateFilter: TransactionDateFilter) {
    const response = await PaymentService.getTransactions(this.context.state['currentOrganization'].id, dateFilter)
    if (response?.data) {
      const formattedList = await this.formatTransactionTableData(response.data.items || [])
      return {
        limit: response.data.limit,
        page: response.data.page,
        total: response.data.total,
        transactionsList: formattedList
      }
    }
    return {}
  }

  // This function will be used to format the transaction response to a required table display format
  @Action({ rawError: true })
  private formatTransactionTableData (transactionList) {
    let transactionTableData = []
    transactionList.forEach(transaction => {
      let transactionNames = []
      transaction?.invoice?.lineItems?.forEach(lineItem => {
        transactionNames.push(lineItem.description)
      })
      transactionTableData.push({
        id: transaction.id,
        transactionNames: transactionNames,
        folioNumber: transaction?.invoice?.folioNumber || '',
        initiatedBy: transaction.createdName,
        transactionDate: transaction.createdOn,
        totalAmount: transaction?.invoice?.total || 0,
        status: transaction.statusCode
      })
    })
    return transactionTableData
  }

  @Action({ rawError: true })
  public async resetAccountSetupProgress (): Promise<void> {
    this.context.commit('setGrantAccess', false)
    this.context.commit('setCurrentOrganization', undefined)
    this.context.commit('setSelectedAccountType', undefined)
  }
}

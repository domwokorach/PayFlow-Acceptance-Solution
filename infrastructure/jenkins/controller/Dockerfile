# Jenkins controller: official LTS image on JDK 21 (multi-arch, runs natively on Apple Silicon and Intel).
FROM jenkins/jenkins:lts-jdk21
# No setup wizard: the admin account and everything else come from Configuration as Code (casc/jenkins.yaml).
ENV JAVA_OPTS="-Djenkins.install.runSetupWizard=false -Dhudson.model.ParametersAction.keepUndefinedParameters=false" \
    CASC_JENKINS_CONFIG=/var/jenkins_home/casc
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt
